import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import Emusks from "emusks";
import {
  decodePayload,
  handleSearch,
  handleUpload,
  handleV1,
  pollFromCard,
  requestBase,
  requestEra,
  requestTok,
  requestUser,
} from "./v1.js";
import { handleV3 } from "./v3.js";
import { handleV11 } from "./v11.js";

const HTTP_PORT = Number(process.env.PORT || 7171);
const LOG = `${import.meta.dir}/../requests.log`;

const OWNER_TOKEN = process.env.EMUSKS_TOKEN || "";
const OWNER_PASSWORD = process.env.REVIVAL_PASSWORD || "";
const SECRET_FILE = `${import.meta.dir}/../.secret`;
const SECRET = (() => {
  if (process.env.REVIVAL_SECRET) return Buffer.from(process.env.REVIVAL_SECRET);
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE);
  const fresh = randomBytes(32);
  writeFileSync(SECRET_FILE, fresh, { mode: 0o600 });
  return fresh;
})();
const SEAL_KEY = createHash("sha256").update(SECRET).digest();

function seal(prefix, text, iv = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", SEAL_KEY, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${prefix}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

function unseal(prefix, token) {
  if (typeof token !== "string" || !token.startsWith(`${prefix}.`)) return null;
  try {
    const raw = Buffer.from(token.slice(prefix.length + 1), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", SEAL_KEY, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const sealToken = (authToken) => seal("rv1", authToken);
const openToken = (token) => unseal("rv1", token);
const sealCap = (authToken) =>
  seal("rc1", `cap:${authToken}`, createHmac("sha256", SEAL_KEY).update(`cap|${authToken}`).digest().subarray(0, 12));
const openCap = (token) => unseal("rc1", token)?.match(/^cap:(.+)$/)?.[1] || null;

const clients = new Map();

const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.at > windowMs) {
    buckets.set(key, { at: now, n: 1 });
    if (buckets.size > 20000) for (const [k, v] of buckets) if (now - v.at > 600_000) buckets.delete(k);
    return false;
  }
  b.n++;
  return b.n > max;
}

const sameSecret = (a, b) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

async function clientFor(authToken) {
  if (!clients.has(authToken)) {
    const pending = (async () => {
      const client = new Emusks();
      const me = await client.login(authToken);
      log(`session ready @${me.username}`);
      return { client, me, key: authToken };
    })();
    pending.catch(() => clients.delete(authToken));
    clients.set(authToken, pending);
  }
  return await clients.get(authToken);
}

class AuthError extends Error {}

const PUBLIC_READS =
  /^\/(search\.json$|1\/related_results\/|1\/trends\/|revival\/(space|community)\/)/;
const publicRead = new AsyncLocalStorage();

async function getSession(tok, allowCap = false) {
  const authToken = openToken(tok) || (allowCap && openCap(tok)) || (publicRead.getStore() ? OWNER_TOKEN : null);
  if (!authToken) throw new AuthError("Sign in first");
  return await clientFor(authToken);
}

let emusksChain = Promise.resolve();
function emusksCall(fn) {
  const run = emusksChain.then(() => fn());
  emusksChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

let timeoutsInRow = 0;

async function emusksOp(tok, fn, allowCap = false) {
  let s = await getSession(tok, allowCap);
  try {
    const result = await emusksCall(() => fn(s.client));
    timeoutsInRow = 0;
    return result;
  } catch (e) {
    if (/worker timeout/i.test(String(e?.message || e)) && ++timeoutsInRow >= 3) {
      log(
        "cycletls worker wedged after 3 timeouts in a row, exiting so the supervisor restarts the shim",
      );
      setTimeout(() => process.exit(75), 50);
    }
    if (/csrf|cookie|matching|failed to log in|expired|unauthor/i.test(String(e?.message || e))) {
      log(`emusks session stale (${e?.message || e}) -> re-login + retry`);
      clients.delete(s.key);
      s = await getSession(tok, allowCap);
      return await emusksCall(() => fn(s.client));
    }
    throw e;
  }
}

const spaceCache = new Map();

const log = (line) => {
  const s = `${new Date().toISOString()} ${line}`;
  console.log(s);
  try {
    appendFileSync(LOG, `${s}\n`);
  } catch {}
};

const form = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

const json = (str, status = 200) =>
  new Response(str, { status, headers: { "content-type": "application/json;charset=utf-8" } });

const tokenFromAuth = (req) => {
  const h =
    req.headers.get("authorization") || req.headers.get("x-verify-credentials-authorization") || "";
  return /oauth_token="([^"]+)"/.exec(h)?.[1] || null;
};

async function doLogin(req, url) {
  const bp = new URLSearchParams(await req.text().catch(() => ""));
  const get = (k) => url.searchParams.get(k) ?? bp.get(k);
  const identifier =
    get("x_auth_identifier") || get("x_auth_username") || get("username") || "user";
  const provided = (get("x_auth_password") || get("password") || "").trim();
  let authToken = null;
  if (/^[0-9a-f]{32,64}$/i.test(provided)) authToken = provided;
  else if (OWNER_TOKEN && OWNER_PASSWORD && sameSecret(provided, OWNER_PASSWORD)) authToken = OWNER_TOKEN;
  if (!authToken) throw new AuthError("Use your X auth_token as the password");
  const { me } = await clientFor(authToken);
  const oauth_token = sealToken(authToken);
  const oauth_token_secret = randomBytes(16).toString("hex");
  log(`LOGIN ok @${me.username} id=${me.id} identifier=${identifier}`);
  return { oauth_token, oauth_token_secret, me };
}

const IMG_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com", "video.twimg.com"]);
const IMG_MAX = 16 * 1024 * 1024;
const IMG_CACHE_ITEM = 1024 * 1024;
const IMG_CACHE_TOTAL = 96 * 1024 * 1024;
const imgCache = new Map();
let imgCacheBytes = 0;

async function handleImg(path, url) {
  let target;
  try {
    target = new URL(
      path === "/img"
        ? url.searchParams.get("u")
        : Buffer.from(path.slice(5), "base64url").toString(),
    );
  } catch {
    return new Response("bad image url", { status: 400 });
  }
  if (target.protocol !== "https:" || !IMG_HOSTS.has(target.hostname))
    return new Response("host not allowed", { status: 403 });
  const size = url.searchParams.get("size");
  if (size && /^(thumb|small|medium|large|orig|\d+x\d+)$/.test(size))
    target.searchParams.set("name", size);
  const key = target.toString();
  let hit = imgCache.get(key);
  if (!hit) {
    const res = await fetch(key, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return new Response("upstream error", { status: 502 });
    if (Number(res.headers.get("content-length") || 0) > IMG_MAX) return new Response("too large", { status: 413 });
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > IMG_MAX) return new Response("too large", { status: 413 });
      chunks.push(chunk);
    }
    hit = { body: Buffer.concat(chunks), type: res.headers.get("content-type") || "image/jpeg" };
    if (hit.body.length <= IMG_CACHE_ITEM) {
      imgCache.set(key, hit);
      imgCacheBytes += hit.body.length;
      while (imgCacheBytes > IMG_CACHE_TOTAL) {
        const [oldKey, old] = imgCache.entries().next().value;
        imgCache.delete(oldKey);
        imgCacheBytes -= old.body.length;
      }
    }
  }
  return new Response(hit.body, {
    headers: {
      "content-type": hit.type,
      "content-length": String(hit.body.length),
      "cache-control": "max-age=86400",
    },
  });
}

const esc = (t) =>
  String(t ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function payloadPage(pay) {
  const parts = [];
  for (const p of pay.p || []) parts.push(`<img src="${esc(p.u)}?name=large" alt="">`);
  if (pay.v?.s)
    parts.push(
      `<video src="${esc(pay.v.s)}" poster="${esc(pay.v.t)}" controls autoplay playsinline ${pay.v.g ? "loop muted" : ""}></video>`,
    );
  if (pay.k)
    parts.push(
      `<div class="box">${pay.k.i ? `<img src="${esc(pay.k.i.u)}" alt="">` : ""}<b>${esc(pay.k.t)}</b><p>${esc(pay.k.x)}</p><small>${esc(pay.k.d)}</small></div>`,
    );
  if (pay.o) {
    const total = pay.o.c.reduce((n, c) => n + c.n, 0) || 1;
    parts.push(
      `<div class="box">${pay.o.c.map((c) => `<p>${esc(c.l)} <b>${Math.round((c.n / total) * 100)}%</b></p>`).join("")}<small>${total} votes</small></div>`,
    );
  }
  if (pay.q)
    parts.push(
      `<div class="box"><b>${esc(pay.q.n)}</b> <small>@${esc(pay.q.s)}</small><p>${esc(pay.q.t)}</p>${pay.q.p ? `<img src="${esc(pay.q.p.u)}?name=medium" alt="">` : ""}</div>`,
    );
  if (pay.n)
    parts.push(`<div class="box note"><b>Readers added context</b><p>${esc(pay.n.t)}</p></div>`);
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twitter</title><style>body{margin:0;background:#111;color:#eee;font:16px sans-serif}img,video{display:block;width:100%;margin:0 0 6px}.box{margin:10px;padding:10px;border:1px solid #444;border-radius:6px;background:#1b1b1b}.box img{margin-top:8px}small{color:#999}.note{border-color:#8a7a2a}</style>${parts.join("")}`;
}

async function handlePayload(req, path, url) {
  const pay = decodePayload(path.slice(3));
  if (!pay) return new Response("bad payload", { status: 400 });
  if ((req.headers.get("accept") || "").includes("text/html"))
    return new Response(payloadPage(pay), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; img-src https://pbs.twimg.com https://abs.twimg.com; media-src https://video.twimg.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  const lead = pay.p?.[0]?.u || pay.v?.t || pay.k?.i?.u || pay.q?.p?.u || pay.q?.a;
  if (!lead) return new Response("no image", { status: 404 });
  const inner = new URL("http://shim/img");
  inner.searchParams.set("u", lead);
  inner.searchParams.set("size", url.searchParams.get("size") || "medium");
  return await handleImg("/img", inner);
}

async function params(req, url) {
  const q = Object.fromEntries(url.searchParams);
  if (req.method !== "GET" && req.method !== "HEAD") {
    const type = req.headers.get("content-type") || "";
    const text = await req
      .clone()
      .text()
      .catch(() => "");
    if (type.includes("json")) {
      try {
        Object.assign(q, JSON.parse(text));
      } catch {}
    } else if (text && !type.includes("multipart")) {
      Object.assign(q, Object.fromEntries(new URLSearchParams(text)));
    }
  }
  return q;
}

async function handle(req) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const tok = tokenFromAuth(req);
  if (!path.startsWith("/img") && !path.startsWith("/m/"))
    log(
      `${req.method} ${path}${url.search ? `?${[...url.searchParams.keys()].join("&")}` : ""} auth=${tok ? "yes" : "no"}`,
    );

  try {
    if (path === "/revival/health")
      return json(
        JSON.stringify({ ok: true, name: "twitter-revival-server", owner: !!OWNER_TOKEN }),
      );
    if (path.startsWith("/img/") || path === "/img") return await handleImg(path, url);
    if (path === "/revival/vote" && req.method === "POST") {
      const q = await params(req, url);
      const voter = q.t || tok;
      if (!openToken(voter) && !openCap(voter)) throw new AuthError("Sign in first");
      const choice = Number(q.choice);
      if (
        !/^\d+$/.test(q.tweet_id || "") ||
        !/^card:\/\/\d+$/.test(q.card_uri || "") ||
        !/^poll\dchoice_(text_only|image)$/.test(q.card_name || "") ||
        !(choice >= 1 && choice <= 4)
      ) {
        return json(`{"errors":[{"code":44,"message":"Bad vote"}]}`, 400);
      }
      const body = new URLSearchParams({
        "twitter:string:card_uri": q.card_uri,
        "twitter:long:original_tweet_id": q.tweet_id,
        "twitter:string:response_card_name": q.card_name,
        "twitter:string:cards_platform": "Web-12",
        "twitter:string:selected_choice": String(choice),
      }).toString();
      const res = await emusksOp(
        voter,
        (c) =>
          c.v1_1(["post", "https://caps.x.com/v2/capi/passthrough/1"], {
            body,
            headers: { "content-type": "application/x-www-form-urlencoded" },
          }),
        true,
      );
      const data = await res.json();
      if (!data?.card) {
        log(`VOTE failed ${q.tweet_id} status=${res.status} ${JSON.stringify(data).slice(0, 300)}`);
        return json(`{"errors":[{"code":131,"message":"Vote failed"}]}`, 502);
      }
      log(`VOTE ok ${q.tweet_id} choice=${choice}`);
      return json(JSON.stringify(pollFromCard(data.card)));
    }
    const communityId = /^\/revival\/community\/(\d{5,25})$/.exec(path)?.[1];
    if (communityId) {
      const key = `community:${communityId}`;
      const hit = spaceCache.get(key);
      if (hit && Date.now() - hit.at < 3_600_000) return json(hit.body);
      const raw = await emusksOp(
        url.searchParams.get("t") || tok,
        (c) =>
          c.graphql("CommunityByRestId", {
            variables: { communityId, withDmMuting: false, withSafetyModeUserFields: false },
          }),
        true,
      );
      const found = raw?.data?.communityResults?.result;
      if (!found?.name)
        return json(`{"errors":[{"code":34,"message":"Community not found"}]}`, 404);
      const body = JSON.stringify({ n: found.name, m: found.member_count || 0 }).replace(
        /[\u007f-\uffff]/g,
        (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
      );
      spaceCache.set(key, { at: Date.now(), body });
      if (spaceCache.size > 500) spaceCache.delete(spaceCache.keys().next().value);
      return json(body);
    }
    const spaceId = /^\/revival\/space\/([A-Za-z0-9]{8,20})$/.exec(path)?.[1];
    if (spaceId) {
      const hit = spaceCache.get(spaceId);
      if (hit && Date.now() - hit.at < 60_000) return json(hit.body);
      const raw = await emusksOp(
        url.searchParams.get("t") || tok,
        (c) =>
          c.graphql("AudioSpaceById", {
            variables: {
              id: spaceId,
              isMetatagsQuery: false,
              withReplays: true,
              withListeners: true,
            },
          }),
        true,
      );
      const m = raw?.data?.audioSpace?.metadata;
      if (!m) return json(`{"errors":[{"code":34,"message":"Space not found"}]}`, 404);
      const creator = m.creator_results?.result;
      const body = JSON.stringify({
        t: m.title || "",
        s: m.state || "",
        c: creator?.core?.screen_name || creator?.legacy?.screen_name || "",
        l: m.total_live_listeners || 0,
        r: m.is_space_available_for_replay ? 1 : 0,
      }).replace(
        /[\u007f-\uffff]/g,
        (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
      );
      spaceCache.set(spaceId, { at: Date.now(), body });
      if (spaceCache.size > 500) spaceCache.delete(spaceCache.keys().next().value);
      return json(body);
    }
    if (path.startsWith("/m/")) return await handlePayload(req, path, url);
    if (path === "/twitpic/upload.xml" || path === "/yfrog/upload") {
      const session = await getSession(tok);
      return await handleUpload(req, path.startsWith("/yfrog") ? "yfrog" : "twitpic", {
        op: (fn) => emusksOp(tok, fn),
        me: session.me,
        log,
      });
    }
    if (
      path === "/search.json" ||
      path.startsWith("/1/") ||
      path.startsWith("/i/") ||
      path.startsWith("/mobile_client_api/")
    ) {
      const q = await params(req, url);
      const session = /\/decider\/android\.json$/.test(path) ? {} : await getSession(tok);
      const ctx = {
        op: (fn) => emusksOp(tok, fn),
        me: session.me,
        method: req.method,
        log,
        req,
        ua: req.headers.get("user-agent") || "",
      };
      const res =
        path === "/search.json"
          ? await handleSearch(q, ctx)
          : ((requestEra.getStore() === "2014" ? await handleV11(path, q, ctx) : null) ??
            (await handleV3(path, q, ctx)) ??
            (path.startsWith("/1/") ? await handleV1(path, q, ctx) : null));
      if (res) return res;
      log(`UNHANDLED v1 ${req.method} ${path} ${Object.keys(q).join(",")}`);
      return json(`{"errors":[{"code":34,"message":"Sorry, that page does not exist"}]}`, 404);
    }
    if (path === "/oauth/access_token") {
      const accept = req.headers.get("accept") || "";
      const r = await doLogin(req, url);
      if (accept.includes("json") && requestEra.getStore() !== "2014") {
        return json(
          `{"oauth_token":"${r.oauth_token}","oauth_token_secret":"${r.oauth_token_secret}","user_id":${r.me.id},"screen_name":${JSON.stringify(r.me.username)}}`,
        );
      }
      return new Response(
        form({
          oauth_token: r.oauth_token,
          oauth_token_secret: r.oauth_token_secret,
          user_id: r.me.id,
          screen_name: r.me.username,
        }),
        {
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }
    if (path === "/auth/1/xauth_password.json") {
      const r = await doLogin(req, url);
      return json(
        `{"oauth_token":"${r.oauth_token}","oauth_token_secret":"${r.oauth_token_secret}","user_id":${r.me.id},"screen_name":${JSON.stringify(r.me.username)}}`,
      );
    }
    if (path === "/oauth2/token")
      return json(JSON.stringify({ token_type: "bearer", access_token: "REVIVALAPPBEARER" }));
    if (path === "/oauth/request_token") {
      return new Response(
        form({
          oauth_token: `req-${crypto.randomUUID()}`,
          oauth_token_secret: "x",
          oauth_callback_confirmed: "true",
        }),
        {
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }
    if (path === "/1.1/guest/activate.json")
      return json(JSON.stringify({ guest_token: "1234567890123456789" }));
    if (path === "/1.1/help/settings.json" || path === "/1.1/help/configuration.json")
      return json(
        JSON.stringify({
          max_media_per_upload: 4,
          photo_size_limit: 5242880,
          characters_reserved_per_media: 24,
          short_url_length: 23,
          short_url_length_https: 23,
        }),
      );
    if (path.startsWith("/1.1/jot") || path.startsWith("/1.1/scribe")) return json("{}");
    if (path === "/1.1/graph/app/optout/status.json")
      return json(JSON.stringify({ optout: false }));
    if (path.startsWith("/1.1/")) {
      const q = await params(req, url);
      const session = await getSession(tok);
      const ctx = {
        op: (fn) => emusksOp(tok, fn),
        me: session.me,
        method: req.method,
        log,
        req,
        ua: req.headers.get("user-agent") || "",
      };
      const res = await requestEra.run("2014", () => handleV11(path, q, ctx));
      if (res) return res;
      log(`UNHANDLED 1.1 ${req.method} ${path} ${Object.keys(q).join(",")}`);
      return json("{}");
    }
    log(`UNHANDLED(non-1.1) ${path}`);
    return json("{}");
  } catch (e) {
    if (e instanceof AuthError)
      return json(
        JSON.stringify({ error: e.message, errors: [{ code: 89, message: e.message }] }),
        401,
      );
    log(
      `ERROR ${path}: ${e?.message || e} :: ${String(e?.stack || "")
        .split("\n")
        .slice(0, 4)
        .join(" | ")}`,
    );
    return json(`{"errors":[{"code":131,"message":"Something went wrong on the revival server"}]}`, 500);
  }
}

const clientIp = (req, server) => {
  const peer = server.requestIP(req)?.address || "";
  if (!/^(127\.|::1$|::ffff:127\.)/.test(peer)) return peer;
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || peer;
};

const withBase = (req, server) => {
  const claimed = req.headers.get("x-revival-base") || "";
  const safe = /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(claimed)
    ? claimed
    : `http://${req.headers.get("host") || `127.0.0.1:${HTTP_PORT}`}`;
  const era =
    req.headers.get("x-revival-client") === "2014" ||
    /TwitterAndroid\/4\./.test(req.headers.get("user-agent") || "")
      ? "2014"
      : "";
  const path = new URL(req.url, "http://localhost").pathname;
  const open = PUBLIC_READS.test(path);
  const authToken = openToken(tokenFromAuth(req));
  const ip = clientIp(req, server);
  if (/^\/(oauth\/access_token|auth\/1\/xauth_password\.json)$/.test(path) && limited(`login|${ip}`, 10, 600_000))
    return json(`{"errors":[{"code":88,"message":"Too many sign in attempts, try again in a few minutes"}]}`, 429);
  if (!authToken && open && limited(`public|${ip}`, 60, 60_000))
    return json(`{"errors":[{"code":88,"message":"Rate limit exceeded"}]}`, 429);
  if ((path.startsWith("/img") || path.startsWith("/m/")) && limited(`img|${ip}`, 1200, 60_000))
    return new Response("rate limit exceeded", { status: 429 });
  const userKey = authToken ? createHash("sha256").update(authToken).digest("hex").slice(0, 24) : open && OWNER_TOKEN ? "owner" : "anon";
  return publicRead.run(open, () =>
    requestBase.run(safe, () =>
      requestEra.run(era, () =>
        requestUser.run(userKey, () => requestTok.run(authToken ? sealCap(authToken) : null, () => handle(req))),
      ),
    ),
  );
};
const httpServer = Bun.serve({ port: HTTP_PORT, idleTimeout: 255, maxRequestBodySize: 24 * 1024 * 1024, fetch: withBase });
log(`server listening http://0.0.0.0:${httpServer.port}`);
