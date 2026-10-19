import { AsyncLocalStorage } from "node:async_hooks";
import parseTimeline from "../node_modules/emusks/src/parsers/timeline.js";
import parseUser from "../node_modules/emusks/src/parsers/user.js";
import { toV1Tweet, toV1User, v1Stringify } from "./map.js";

export const requestBase = new AsyncLocalStorage();
export const requestEra = new AsyncLocalStorage();
export const requestTok = new AsyncLocalStorage();
export const requestUser = new AsyncLocalStorage();
const user = () => requestUser.getStore() || "";
const nativeMedia = () => requestEra.getStore() === "2014";
const FALLBACK_BASE =
  process.env.SHIM_PUBLIC_BASE || `http://127.0.0.1:${process.env.PORT || 7171}`;
const base = () => requestBase.getStore() || FALLBACK_BASE;

export const proxied = (u) => (u ? `${base()}/img/${Buffer.from(u).toString("base64url")}` : null);

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (s) =>
  String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
    const cp = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const pad = (n) => String(n).padStart(2, "0");
const asDate = (v) => {
  const d = typeof v === "number" || /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
export const classicDate = (v) => {
  const d = asDate(v);
  return `${DAY[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
};
const searchDate = (v) => {
  const d = asDate(v);
  return `${DAY[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
};

const avatar = (url) =>
  url
    ? proxied(url.replace(/_normal(\.\w+)$/, "_200x200$1"))
    : proxied("https://abs.twimg.com/sticky/default_profile_images/default_profile_200x200.png");

export const rid = (v) => (v == null ? null : `@@RID@@${v}`);
export const bigId = (v) => {
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
};
const byIdDesc = (a, b) => (bigId(b.id_str ?? b.id) > bigId(a.id_str ?? a.id) ? 1 : -1);

export function user2011(u) {
  const v = toV1User(u);
  if (!v) return null;
  v.profile_image_url = avatar(u.profile_picture?.url);
  v.profile_image_url_https = v.profile_image_url;
  v.name = decodeEntities(v.name);
  v.description = decodeEntities(v.description);
  v.location = decodeEntities(v.location);
  v.url = v.entities.url.urls[0]?.expanded_url || v.url;
  v.url_https = v.url;
  v.followed_by = u.misc?.followed_by ?? false;
  v.following = u.misc?.following ?? false;
  v.blocking = !!u.misc?.blocking;
  v.can_dm = u.misc?.can_dm ?? true;
  v.notifications = false;
  delete v.entities;
  return v;
}

export function legacyUser2011(u) {
  if (!u) return null;
  return {
    id: rid(u.id_str),
    id_str: u.id_str,
    name: decodeEntities(u.name),
    screen_name: u.screen_name,
    location: decodeEntities(u.location || ""),
    description: decodeEntities(u.description || ""),
    url: u.entities?.url?.urls?.[0]?.expanded_url || u.url || null,
    url_https: u.entities?.url?.urls?.[0]?.expanded_url || u.url || null,
    protected: !!u.protected,
    verified: !!(u.verified || u.is_blue_verified),
    followers_count: u.followers_count ?? 0,
    friends_count: u.friends_count ?? 0,
    statuses_count: u.statuses_count ?? 0,
    favourites_count: u.favourites_count ?? 0,
    listed_count: u.listed_count ?? 0,
    created_at: classicDate(u.created_at),
    geo_enabled: false,
    following: !!u.following,
    followed_by: !!u.followed_by,
    blocking: !!u.blocking,
    can_dm: u.can_dm ?? true,
    notifications: false,
    profile_image_url: avatar(u.profile_image_url_https),
    profile_image_url_https: avatar(u.profile_image_url_https),
    lang: "en",
    utc_offset: null,
    time_zone: null,
  };
}

function place(text, needle, from = 0) {
  if (!needle) return null;
  const i = text.indexOf(needle, from);
  return i === -1 ? null : [i, i + needle.length];
}

const INVIS = "\u2060";

const imgRef = (url, w, h) => (url ? { u: url, w: w || 0, h: h || 0 } : null);

function mediaRefs(media) {
  const photos = [];
  let video = null;
  for (const m of media || []) {
    const w = m.original_info?.width || m.sizes?.large?.w;
    const h = m.original_info?.height || m.sizes?.large?.h;
    if (m.type === "video" || m.type === "animated_gif") {
      if (video) continue;
      const mp4 = (m.video_info?.variants || [])
        .filter((x) => x.content_type === "video/mp4")
        .sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0));
      const pick = mp4.find((x) => (x.bitrate || 0) <= 2_200_000) || mp4.at(-1) || mp4[0];
      video = {
        t: m.media_url_https,
        s: pick?.url || null,
        w: w || 16,
        h: h || 9,
        g: m.type === "animated_gif" ? 1 : 0,
        d: m.video_info?.duration_millis || 0,
      };
    } else if (m.media_url_https && photos.length < 4) {
      photos.push(imgRef(m.media_url_https, w, h));
    }
  }
  return { photos, video };
}

function bindings(card) {
  const out = {};
  const raw = card?.legacy?.binding_values || card?.binding_values || [];
  for (const b of Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([key, value]) => ({ key, value }))) {
    const v = b.value || {};
    out[b.key] = v.string_value ?? v.image_value ?? v.boolean_value ?? v.scribe_key ?? v;
  }
  return out;
}

function linkCard(src) {
  if (!src.card || src.poll) return null;
  const b = bindings(src.card);
  const title = typeof b.title === "string" ? b.title : null;
  if (!title) return null;
  const image =
    b.summary_photo_image_original ||
    b.photo_image_full_size_original ||
    b.thumbnail_image_original ||
    b.player_image_original ||
    null;
  const domain =
    typeof b.vanity_url === "string" ? b.vanity_url : typeof b.domain === "string" ? b.domain : "";
  const cardUrl = typeof b.card_url === "string" ? b.card_url : null;
  const u = (src.urls || []).find((x) => x.url === cardUrl)?.expanded_url || cardUrl || null;
  return {
    u,
    t: decodeEntities(title),
    d: domain,
    x: typeof b.description === "string" ? decodeEntities(b.description).slice(0, 200) : "",
    i: image?.url ? imgRef(image.url, image.width, image.height) : null,
  };
}

function stripUrls(text, t) {
  let out = text;
  for (const m of t.media || []) if (m.url) out = out.split(m.url).join("");
  const quoteId = t.quoting?.id;
  for (const u of t.urls || []) {
    if (!u.url) continue;
    const isQuoteLink = quoteId && new RegExp(`/status(es)?/${quoteId}`).test(u.expanded_url || "");
    if (isQuoteLink) out = out.split(u.url).join("");
  }
  return out
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

function quoteRef(q) {
  if (!q) return null;
  const { photos, video } = mediaRefs(q.media);
  let text = stripUrls(decodeEntities(q.text), q);
  for (const u of q.urls || [])
    if (u.url) text = text.split(u.url).join(u.display_url || u.expanded_url || u.url);
  return {
    i: String(q.id),
    n: decodeEntities(q.user?.name || ""),
    s: q.user?.username || "",
    a: q.user?.profile_picture?.url || null,
    v: q.user?.verification?.verified || q.user?.verification?.premium_verified ? 1 : 0,
    t: text,
    c: Date.parse(q.created_at) || 0,
    p: photos[0] || (video ? imgRef(video.t, video.w, video.h) : null),
    m: video ? 1 : 0,
  };
}

function payloadOf(src) {
  const { photos, video } = mediaRefs(src.media);
  const pay = {};
  if (photos.length) pay.p = photos;
  if (video) pay.v = video;
  const card = linkCard(src);
  if (card) pay.k = card;
  const tok = requestTok.getStore();
  if (/audiospace$/.test(src.card?.legacy?.name || src.card?.name || "")) {
    const id = bindings(src.card).id;
    if (typeof id === "string" && /^[A-Za-z0-9]{8,20}$/.test(id))
      pay.s = { i: id, ...(tok ? { t: tok } : {}) };
  }
  if (src.poll?.choices?.length) {
    pay.o = {
      c: src.poll.choices.map((c) => ({ l: decodeEntities(c.label || ""), n: c.count || 0 })),
      e: src.poll.ends_at ? Date.parse(src.poll.ends_at) || 0 : 0,
      f: src.poll.counts_are_final ? 1 : 0,
      s: src.poll.selected_choice || 0,
      i: String(src.id),
      u: src.poll.card_uri || "",
      k: `poll${src.poll.choices.length}choice_${src.poll.choices.some((c) => c.image) ? "image" : "text_only"}`,
      ...(tok ? { t: tok } : {}),
    };
  }
  const q = src.quoting && !src.retweeting ? quoteRef(src.quoting) : null;
  if (q) pay.q = q;
  if (src.community_note?.text) pay.n = { t: decodeEntities(src.community_note.text) };
  if (src.community_id && /^\d+$/.test(String(src.community_id)))
    pay.y = { i: String(src.community_id), ...(tok ? { t: tok } : {}) };
  return Object.keys(pay).length ? pay : null;
}

export const payloadUrl = (pay) =>
  `${base()}/m/${Buffer.from(JSON.stringify(pay)).toString("base64url")}`;

export function decodePayload(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString());
  } catch {
    return null;
  }
}

const seenTweets = new Map();
const seenKey = (screen, text) =>
  `${String(screen).toLowerCase()}|${String(text)
    .replace(/\u2060/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)}`;

function remember(screen, text, id) {
  seenTweets.set(`${user()}|${seenKey(screen, text)}`, id);
  if (seenTweets.size > 4000) seenTweets.delete(seenTweets.keys().next().value);
}

const pendingMedia = new Map();

export function multipartFile(bytes, contentType, field = "media") {
  const boundary = /boundary=("?)([^";]+)\1/i.exec(contentType || "")?.[2] || "twitter";
  const buf = Buffer.from(bytes);
  const marker = Buffer.from(`--${boundary}`);
  let at = buf.indexOf(marker);
  while (at !== -1) {
    const next = buf.indexOf(marker, at + marker.length);
    const part = buf.subarray(at + marker.length, next === -1 ? buf.length : next);
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd !== -1) {
      const head = part.subarray(0, headEnd).toString();
      if (new RegExp(`name="${field}(\\[\\])?"`, "i").test(head)) {
        let body = part.subarray(headEnd + 4);
        if (body.subarray(-2).toString() === "\r\n") body = body.subarray(0, -2);
        const type = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
        return new Blob([body], { type: type || "image/jpeg" });
      }
    }
    at = next;
  }
  return null;
}

export async function handleUpload(req, kind, ctx) {
  const contentType = req.headers.get("content-type") || "";
  const raw = new Uint8Array(await req.arrayBuffer());
  const file = multipartFile(raw, contentType);
  ctx.log?.(
    `UPLOAD ${kind} type=${contentType} bytes=${raw.length} file=${file ? file.size : "none"}`,
  );
  if (!file)
    return new Response('<rsp stat="fail"><err msg="no media"/></rsp>', {
      status: 400,
      headers: { "content-type": "text/xml" },
    });
  const uploaded = await ctx.op((c) =>
    c.media.create(file, {
      mediaType: file.type && file.type !== "application/octet-stream" ? file.type : undefined,
    }),
  );
  const mediaId = String(uploaded?.media_id_string || uploaded?.media_id || uploaded?.id || "");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  pendingMedia.set(`${user()}|${token}`, { mediaId, at: Date.now() });
  for (const [k, v] of pendingMedia) if (Date.now() - v.at > 3_600_000) pendingMedia.delete(k);
  ctx.log?.(`UPLOAD ok media_id=${mediaId} token=${token}`);
  if (kind === "yfrog")
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rsp stat="ok"><mediaid>${token}</mediaid><mediaurl>http://yfrog.com/${token}</mediaurl></rsp>`,
      { headers: { "content-type": "text/xml; charset=utf-8" } },
    );
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><image><id>${token}</id><text></text><url>http://twitpic.com/${token}</url><width>0</width><height>0</height><size>0</size><type>jpg</type></image>`,
    { headers: { "content-type": "text/xml; charset=utf-8" } },
  );
}

function fixStatus(v, src) {
  if (!v) return v;
  const native = nativeMedia();
  const lead = native ? (src.media || []).find((m) => m.media_url_https && m.url) : null;
  let text = stripUrls(decodeEntities(v.text), src);
  if (lead) text = `${text}${text ? " " : ""}${lead.url}`;
  const urls = [];
  for (const u of src.urls || []) {
    const at = place(text, u.url);
    if (at)
      urls.push({
        url: u.url,
        url_https: u.url,
        expanded_url: u.expanded_url || u.url,
        display_url: u.display_url || u.url,
        indices: at,
      });
  }
  const media = lead
    ? [
        {
          id: rid(lead.id_str),
          id_str: String(lead.id_str),
          indices: [text.length - lead.url.length, text.length],
          media_url: lead.media_url_https.replace(/^https:/, "http:"),
          media_url_https: lead.media_url_https,
          url: lead.url,
          url_https: lead.url,
          display_url: lead.display_url || lead.url,
          expanded_url: lead.expanded_url || lead.url,
          type: "photo",
          sizes: lead.sizes?.large
            ? lead.sizes
            : {
                large: {
                  w: lead.original_info?.width || 1024,
                  h: lead.original_info?.height || 1024,
                  resize: "fit",
                },
              },
        },
      ]
    : null;
  const pay = payloadOf(src);
  if (pay) {
    text += INVIS;
    urls.push({
      url: `https://t.co/${INVIS}`,
      url_https: `https://t.co/${INVIS}`,
      expanded_url: payloadUrl(pay),
      display_url: INVIS,
      indices: [text.length - 1, text.length],
    });
  }
  const mentions = [];
  const re = /@([A-Za-z0-9_]{1,15})/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const hit = (src.user_mentions || []).find(
      (x) => x.screen_name?.toLowerCase() === m[1].toLowerCase(),
    );
    mentions.push({
      screen_name: m[1],
      name: hit?.name || m[1],
      id: rid(hit?.id_str || "0"),
      id_str: hit?.id_str || "0",
      indices: [m.index, m.index + m[0].length],
    });
  }
  v.text = text;
  if (src.user?.username) remember(src.user.username, text, String(src.id));
  v.entities = {
    urls: urls.sort((a, b) => a.indices[0] - b.indices[0]),
    user_mentions: mentions,
    hashtags: [],
  };
  if (native) {
    const tags = /(^|[^\w&])#(\w+)/g;
    for (let m = tags.exec(text); m; m = tags.exec(text)) {
      const at = m.index + m[1].length;
      v.entities.hashtags.push({ text: m[2], indices: [at, at + m[2].length + 1] });
    }
    if (media) v.entities.media = media;
  }
  if (requestEra.getStore() === "2014") {
    const cp = (i) => Array.from(text.slice(0, i)).length;
    for (const list of Object.values(v.entities))
      for (const e of list) e.indices = e.indices.map(cp);
  }
  delete v.extended_entities;
  delete v.quoted_status;
  delete v.quoted_status_id;
  delete v.quoted_status_id_str;
  delete v.is_quote_status;
  v.user = src.user ? user2011(src.user) : v.user;
  v.source = v.source || '<a href="https://x.com">web</a>';
  v.favorited = !!src.engagement?.liked;
  v.retweeted = !!src.engagement?.retweeted;
  const rt = src.retweeting || src.repost || src.retweeted_status;
  if (rt) v.retweeted_status = fixStatus(toV1Tweet(rt), rt);
  return v;
}

export const status2011 = (t) => (t ? fixStatus(toV1Tweet(t), t) : null);

const asciiJson = (obj) =>
  v1Stringify(obj).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
export const out = (obj, status = 200) =>
  new Response(asciiJson(obj), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
export const fail = (status, message, code = 34) =>
  out({ error: message, errors: [{ code, message }] }, status);

const pageCursors = new Map();
export const numericCursors = new Map();
let cursorSeq = 1000;

export function cursorToken(s) {
  if (!s) return 0;
  const n = ++cursorSeq;
  numericCursors.set(String(n), s);
  if (numericCursors.size > 5000) numericCursors.delete(numericCursors.keys().next().value);
  return n;
}

export async function paged(name, q, fetchPage) {
  const key = `${user()}|${name}`;
  const count = Math.min(Math.max(Number(q.count || q.rpp || q.per_page) || 20, 1), 200);
  const sinceId = q.since_id ? bigId(q.since_id) : null;
  const maxId = q.max_id ? bigId(q.max_id) : null;
  const page = Math.max(Number(q.page) || 1, 1);
  let cursor;
  if (maxId) cursor = pageCursors.get(`${key}|${maxId}`) ?? pageCursors.get(`${key}|${maxId + 1n}`);
  if (!maxId && page > 1) cursor = pageCursors.get(`${key}|page${page}`);
  const got = [];
  const seen = new Set();
  let pagesLeft = maxId && !cursor ? 5 : page > 1 && !cursor ? page : 1;
  while (pagesLeft-- > 0) {
    const res = await fetchPage(cursor);
    const tweets = (res.tweets || []).filter((t) => t && !t.promoted);
    for (const t of tweets) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      got.push(t);
    }
    if (tweets.length) {
      const oldest = tweets.reduce(
        (m, t) => (bigId(t.id) < m ? bigId(t.id) : m),
        bigId(tweets[0].id),
      );
      if (res.nextCursor) pageCursors.set(`${key}|${oldest}`, res.nextCursor);
    }
    if (res.nextCursor) pageCursors.set(`${key}|page${page + 1}`, res.nextCursor);
    cursor = res.nextCursor;
    if (!cursor) break;
    if (maxId && tweets.some((t) => bigId(t.id) <= maxId)) break;
  }
  if (pageCursors.size > 5000) pageCursors.delete(pageCursors.keys().next().value);
  return got
    .filter((t) => (!maxId || bigId(t.id) <= maxId) && (!sinceId || bigId(t.id) > sinceId))
    .sort((a, b) => (bigId(b.id) > bigId(a.id) ? 1 : -1))
    .slice(0, count);
}

export const deepCollect = (root, pred, acc = [], seen = new Set()) => {
  if (!root || typeof root !== "object" || seen.has(root)) return acc;
  seen.add(root);
  if (pred(root)) acc.push(root);
  for (const v of Object.values(root)) deepCollect(v, pred, acc, seen);
  return acc;
};

export function list2011(l) {
  const owner = l.user_results?.result;
  const parsed = owner ? parseUser(owner) : null;
  const user = (parsed?.id && parsed.username && user2011(parsed)) || {
    id: rid("0"),
    id_str: "0",
    screen_name: "unknown",
    name: "unknown",
    profile_image_url: avatar(null),
  };
  const slug =
    String(l.name || "list")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "list";
  return {
    id: rid(l.id_str || l.rest_id),
    id_str: String(l.id_str || l.rest_id),
    name: decodeEntities(l.name),
    slug,
    full_name: `@${user.screen_name}/${slug}`,
    uri: `/${user.screen_name}/${slug}`,
    description: decodeEntities(l.description || ""),
    member_count: l.member_count ?? 0,
    subscriber_count: l.subscriber_count ?? 0,
    mode: String(l.mode || "public").toLowerCase(),
    following: !!l.following,
    user,
  };
}

export const listsFrom = (raw) => {
  const found = deepCollect(
    raw,
    (o) =>
      (o.__typename === "List" || (o.id_str && "member_count" in o && "mode" in o)) &&
      (o.id_str || o.rest_id),
  );
  const uniq = new Map();
  for (const l of found) uniq.set(String(l.id_str || l.rest_id), l);
  return [...uniq.values()].map(list2011);
};

function dmFrom(entry, users) {
  const m = entry.message;
  const d = m?.message_data;
  if (!d) return null;
  const sender = legacyUser2011(users[d.sender_id]);
  const recipientId =
    d.recipient_id ||
    String(m.conversation_id || "")
      .split("-")
      .find((x) => x !== d.sender_id);
  const recipient = legacyUser2011(users[recipientId]);
  if (!sender || !recipient) return null;
  let text = decodeEntities(d.text || "");
  const attached = d.attachment?.photo || d.attachment?.animated_gif || d.attachment?.video;
  if (attached?.media_url_https) {
    const link = payloadUrl({
      p: [
        imgRef(
          attached.media_url_https,
          attached.original_info?.width,
          attached.original_info?.height,
        ),
      ],
    });
    text =
      attached.url && text.includes(attached.url)
        ? text.replace(attached.url, link)
        : `${text} ${link}`.trim();
  }
  return {
    id: rid(d.id || m.id),
    id_str: String(d.id || m.id),
    text,
    created_at: classicDate(Number(d.time || m.time)),
    sender_id: rid(d.sender_id),
    sender_id_str: String(d.sender_id),
    sender_screen_name: sender.screen_name,
    recipient_id: rid(recipientId),
    recipient_id_str: String(recipientId),
    recipient_screen_name: recipient.screen_name,
    sender,
    recipient,
    conversation_id: m.conversation_id,
  };
}

const dmCaches = new Map();

async function allDms(op, fresh) {
  const hit = dmCaches.get(user());
  if (!fresh && hit && Date.now() - hit.at < 20_000) return hit.list;
  const inbox = await op((c) => c.dms.inbox());
  const s = inbox.inbox_initial_state || {};
  const users = { ...(s.users || {}) };
  const entries = [...(s.entries || [])];
  const convs = Object.values(s.conversations || {})
    .filter((c) => c.type === "ONE_TO_ONE" || c.type === "GROUP_DM")
    .sort((a, b) => Number(b.sort_timestamp || 0) - Number(a.sort_timestamp || 0))
    .slice(0, 12);
  for (const conv of convs) {
    try {
      const page = await op((c) => c.dms.conversation(conv.conversation_id));
      const t = page.conversation_timeline || {};
      Object.assign(users, t.users || {});
      entries.push(...(t.entries || []));
    } catch {}
  }
  const byId = new Map();
  for (const e of entries) {
    const dm = dmFrom(e, users);
    if (dm) byId.set(dm.id_str, dm);
  }
  const list = [...byId.values()].sort(byIdDesc);
  dmCaches.delete(user());
  dmCaches.set(user(), { at: Date.now(), list });
  if (dmCaches.size > 500) dmCaches.delete(dmCaches.keys().next().value);
  return list;
}

function filterIds(list, q) {
  const sinceId = q.since_id ? bigId(q.since_id) : null;
  const maxId = q.max_id ? bigId(q.max_id) : null;
  const count = Math.min(Number(q.count) || 20, 200);
  const page = Math.max(Number(q.page) || 1, 1);
  return list
    .filter((x) => (!sinceId || bigId(x.id_str) > sinceId) && (!maxId || bigId(x.id_str) <= maxId))
    .slice((page - 1) * count, page * count);
}

export async function resolveUser(op, me, idOrName) {
  const s = String(idOrName ?? "");
  if (!s || s === me.id || s.toLowerCase() === me.username.toLowerCase()) return me;
  return /^\d+$/.test(s)
    ? await op((c) => c.users.get(s))
    : await op((c) => c.users.getByUsername(s.replace(/^@/, "")));
}

export const pickUser = (q) => q.user_id || q.id || q.screen_name || q.user;

async function trendNames(op) {
  const raw = await op((c) => c.trends.explore({ count: 40 }));
  const names = deepCollect(raw, (o) => o.__typename === "TimelineTrend" && o.name).map(
    (o) => o.name,
  );
  return [...new Set(names)].slice(0, 20);
}

async function likes(op, userId, cursor) {
  const raw = await op((c) =>
    c.graphql("Likes", {
      variables: {
        userId,
        count: 40,
        cursor,
        includePromotedContent: false,
        withClientEventToken: false,
        withBirdwatchNotes: false,
        withVoice: true,
      },
    }),
  );
  return parseTimeline(raw);
}

export async function handleV1(path, q, ctx) {
  const { op, me, log } = ctx;
  const p = path.replace(/^\/1\//, "").replace(/\.(json|xml)$/, "");
  const parts = p.split("/");
  const statuses = (list) => out(list.map(status2011).filter(Boolean));

  if (p === "account/verify_credentials") return out(user2011(me));
  if (p === "account/rate_limit_status")
    return out({
      remaining_hits: 350,
      hourly_limit: 350,
      reset_time_in_seconds: Math.floor(Date.now() / 1000) + 3600,
      reset_time: new Date(Date.now() + 3600e3).toUTCString(),
    });
  if (p === "account/update_profile") {
    const params = Object.fromEntries(
      ["name", "url", "location", "description"].filter((k) => q[k] != null).map((k) => [k, q[k]]),
    );
    await op((c) => c.users.updateProfile(params));
    const fresh = await op((c) => c.users.get(me.id));
    Object.assign(me, fresh);
    return out(user2011(fresh));
  }
  if (p === "promoted_tweets/search") return out({ promoted_tweets: [] });
  if (p === "saved_searches") return out([]);
  if (p === "help/test") return out("ok");

  if (p === "statuses/home_timeline")
    return statuses(
      await paged("home", q, (cursor) => op((c) => c.timelines.homeLatest({ count: 40, cursor }))),
    );
  if (p === "statuses/mentions") {
    const query = `@${me.username} -from:${me.username}`;
    return statuses(
      await paged("mentions", q, (cursor) =>
        op((c) => c.search.latest(query, { count: 40, cursor })),
      ),
    );
  }
  if (p === "statuses/user_timeline") {
    const u = await resolveUser(op, me, pickUser(q));
    return statuses(
      await paged(`user:${u.id}`, q, (cursor) =>
        op((c) => c.users.tweets(u.id, { count: 40, cursor })),
      ),
    );
  }
  if (p === "statuses/retweeted_by_me") {
    const mine = await paged(`user:${me.id}`, q, (cursor) =>
      op((c) => c.users.tweets(me.id, { count: 40, cursor })),
    );
    return statuses(mine.filter((t) => t.retweeting));
  }
  if (p === "statuses/retweeted_to_me") {
    const home = await paged("home", q, (cursor) =>
      op((c) => c.timelines.homeLatest({ count: 40, cursor })),
    );
    return statuses(home.filter((t) => t.retweeting));
  }
  if (p === "statuses/retweets_of_me") {
    const mine = await paged(`user:${me.id}`, q, (cursor) =>
      op((c) => c.users.tweets(me.id, { count: 40, cursor })),
    );
    return statuses(mine.filter((t) => !t.retweeting && (t.stats?.retweets ?? 0) > 0));
  }
  if (parts[0] === "statuses" && parts[1] === "show") {
    const t = await op((c) => c.tweets.get(parts[2] || q.id));
    return t ? out(status2011(t)) : fail(404, "No status found with that ID.", 144);
  }
  if (p === "statuses/update") {
    let text = String(q.status ?? "");
    if (text.length > 4000) return fail(403, "Status is over 4000 characters.", 186);
    const opts = q.in_reply_to_status_id ? { replyTo: String(q.in_reply_to_status_id) } : {};
    const mediaIds = [];
    text = text.replace(/https?:\/\/(?:twitpic\.com|yfrog\.com)\/([a-z0-9]{6})\b/gi, (m, token) => {
      const hit = pendingMedia.get(`${user()}|${token}`);
      if (!hit?.mediaId) return m;
      mediaIds.push(hit.mediaId);
      pendingMedia.delete(`${user()}|${token}`);
      return "";
    });
    if (mediaIds.length) opts.mediaIds = mediaIds.slice(0, 4);
    const quote = /^([\s\S]*?)\s*"@(\w{1,15}): ([\s\S]+)"\s*$/.exec(text);
    if (quote) {
      const key = `${user()}|${seenKey(quote[2], quote[3].replace(/\u2026$/, ""))}`;
      const quotedId =
        seenTweets.get(key) ??
        (key.length > user().length + quote[2].length + 22
          ? [...seenTweets].reverse().find(([k]) => k.startsWith(key))?.[1]
          : undefined);
      if (quotedId) {
        text = quote[1];
        opts.quoteTweetId = quotedId;
      }
    }
    const poll = /\s*\u{1F4CA} Poll \(([^)]*)\)((?:\n\u25CB [^\n]*){2,4})\s*$/u.exec(text);
    if (poll && !mediaIds.length) {
      const [, span, lines] = poll;
      const amount = Number(/\d+/.exec(span)?.[0] || 1);
      const unit = /minute/i.test(span) ? 1 : /hour/i.test(span) ? 60 : 1440;
      const choices = lines
        .split("\n\u25CB ")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (choices.length >= 2) {
        text = text.slice(0, poll.index);
        opts.poll = {
          choices: choices.map((c) => c.slice(0, 25)),
          duration_minutes: Math.min(Math.max(amount * unit, 5), 10080),
        };
      }
    }
    text = text.replace(/[ \t]+/g, " ").trim();
    if (!text && opts.quoteTweetId && !mediaIds.length) {
      await op((c) => c.tweets.retweet(opts.quoteTweetId));
      const original = await op((c) => c.tweets.get(opts.quoteTweetId));
      return out(
        status2011({
          id: `${BigInt(original.id) + 1n}`,
          text: `RT @${original.user?.username}: ${original.text}`,
          created_at: new Date().toISOString(),
          user: me,
          retweeting: original,
          urls: [],
          media: [],
        }),
      );
    }
    if (!text && !mediaIds.length) return fail(403, "Status is empty.", 170);
    log?.(
      `POST tweet quote=${opts.quoteTweetId || "-"} reply=${opts.replyTo || "-"} media=${mediaIds.length} poll=${opts.poll ? `${opts.poll.choices.length}/${opts.poll.duration_minutes}m` : "-"} len=${text.length}`,
    );
    const created = await op((c) => c.tweets.create(text, opts));
    const id =
      created?.id ||
      created?.rest_id ||
      deepCollect(created, (o) => o.rest_id && o.legacy?.full_text)[0]?.rest_id;
    const t = id ? await op((c) => c.tweets.get(id)).catch(() => null) : null;
    if (t) return out(status2011(t));
    return out(
      status2011({
        id: id || String(Date.now()),
        text,
        created_at: new Date().toISOString(),
        user: me,
        urls: [],
        media: [],
      }),
    );
  }
  if (parts[0] === "statuses" && parts[1] === "retweet") {
    const id = parts[2] || q.id;
    await op((c) => c.tweets.retweet(id));
    const original = await op((c) => c.tweets.get(id));
    const wrapper = {
      id: `${BigInt(original.id) + 1n}`,
      text: `RT @${original.user?.username}: ${original.text}`,
      created_at: new Date().toISOString(),
      user: me,
      retweeting: original,
      urls: [],
      media: [],
    };
    return out(status2011(wrapper));
  }
  if (parts[0] === "statuses" && parts[1] === "destroy") {
    const id = String(parts[2] || q.id);
    const found = await op((c) => c.tweets.get(id)).catch(() => null);
    const t = found && !found.tombstone && found.user ? found : null;
    if (!t) {
      const original = await op((c) => c.tweets.get(String(bigId(id) - 1n))).catch(() => null);
      if (!original?.engagement?.retweeted) return fail(404, "No status found with that ID.", 144);
      await op((c) => c.tweets.unretweet(original.id));
      return out(
        status2011({
          id,
          text: `RT @${original.user?.username}: ${original.text}`,
          created_at: new Date().toISOString(),
          user: me,
          retweeting: original,
          urls: [],
          media: [],
        }),
      );
    }
    if (t.retweeting || t.user.id !== me.id) {
      await op((c) => c.tweets.unretweet(t.retweeting?.id || id));
    } else {
      await op((c) => c.tweets.delete(id));
    }
    return out(status2011(t));
  }
  if (p === "statuses/friends" || p === "statuses/followers") {
    const u = await resolveUser(op, me, pickUser(q));
    const cursor = q.cursor && q.cursor !== "-1" ? numericCursors.get(String(q.cursor)) : undefined;
    const res = await op((c) =>
      p.endsWith("friends")
        ? c.users.following(u.id, { count: 50, cursor })
        : c.users.followers(u.id, { count: 50, cursor }),
    );
    const users = (res.users || []).map(user2011).filter(Boolean);
    if (!("cursor" in q)) return out(users);
    return out({
      users,
      next_cursor: users.length ? cursorToken(res.nextCursor) : 0,
      previous_cursor: 0,
    });
  }

  if (
    p === "favorites" ||
    (parts[0] === "favorites" && parts.length === 2 && !["create", "destroy"].includes(parts[1]))
  ) {
    const u = await resolveUser(op, me, parts[1] || q.id || q.user_id || q.screen_name);
    return statuses(await paged(`likes:${u.id}`, q, (cursor) => likes(op, u.id, cursor)));
  }
  if (parts[0] === "favorites" && (parts[1] === "create" || parts[1] === "destroy")) {
    const id = parts[2] || q.id;
    await op((c) => (parts[1] === "create" ? c.tweets.like(id) : c.tweets.unlike(id)));
    const t = await op((c) => c.tweets.get(id));
    const v = status2011(t);
    v.favorited = parts[1] === "create";
    return out(v);
  }

  if (p === "friendships/show") {
    const target = await resolveUser(op, me, q.target_id || q.target_screen_name);
    const src = {
      id: rid(me.id),
      id_str: me.id,
      screen_name: me.username,
      following: !!target.misc?.following,
      followed_by: !!target.misc?.followed_by,
      blocking: !!target.misc?.blocking,
      can_dm: target.misc?.can_dm ?? true,
      notifications_enabled: false,
    };
    const tgt = {
      id: rid(target.id),
      id_str: target.id,
      screen_name: target.username,
      following: !!target.misc?.followed_by,
      followed_by: !!target.misc?.following,
    };
    return out({ relationship: { source: src, target: tgt } });
  }
  if (p === "friendships/exists") {
    const a = await resolveUser(op, me, q.user_a || q.user_id_a);
    const b = await resolveUser(op, me, q.user_b || q.user_id_b);
    if (a.id === me.id) return out(!!b.misc?.following);
    if (b.id === me.id) return out(!!a.misc?.followed_by);
    return out(false);
  }
  if (
    p === "friendships/create" ||
    p === "friendships/destroy" ||
    (parts[0] === "friendships" && ["create", "destroy"].includes(parts[1]))
  ) {
    const u = await resolveUser(op, me, parts[2] || pickUser(q));
    await op((c) => (parts[1] === "create" ? c.users.follow(u.id) : c.users.unfollow(u.id)));
    const v = user2011(u);
    v.following = parts[1] === "create";
    return out(v);
  }
  if (p === "friendships/create_all") {
    const ids = String(q.user_id || q.screen_name || "")
      .split(",")
      .filter(Boolean);
    const done = [];
    for (const id of ids.slice(0, 20)) {
      const u = await resolveUser(op, me, id).catch(() => null);
      if (!u) continue;
      await op((c) => c.users.follow(u.id)).catch(() => null);
      done.push(user2011(u));
    }
    return out(done);
  }

  if (p === "users/show") return out(user2011(await resolveUser(op, me, pickUser(q))));
  if (p === "users/lookup") {
    const ids = String(q.user_id || "")
      .split(",")
      .filter(Boolean);
    const names = String(q.screen_name || "")
      .split(",")
      .filter(Boolean);
    const found = [];
    if (ids.length) found.push(...(await op((c) => c.users.getMany(ids.slice(0, 100)))));
    if (names.length)
      found.push(...(await op((c) => c.users.getManyByUsername(names.slice(0, 100)))));
    return out(found.filter(Boolean).map(user2011));
  }
  if (p === "users/search") {
    const res = await op((c) =>
      c.search.users(String(q.q || ""), { count: Math.min(Number(q.per_page) || 20, 40) }),
    );
    return out((res.users || []).map(user2011).filter(Boolean));
  }
  if (p === "users/suggestions") {
    return out([{ name: "Suggested for you", slug: "suggested", size: 20 }]);
  }
  if (parts[0] === "users" && parts[1] === "suggestions") {
    const res = await op((c) => c.timelines.connect({ count: 30 }));
    const users = (res.users || [])
      .filter((u) => u.id !== me.id)
      .slice(0, 20)
      .map(user2011);
    return out({
      name: "Suggested for you",
      slug: parts[2] || "suggested",
      size: users.length,
      users,
    });
  }

  if (p === "direct_messages" || p === "direct_messages/sent") {
    const all = await allDms(op, !!q.since_id || q.page === "1");
    const mine = all.filter((d) =>
      p === "direct_messages"
        ? d.recipient_id_str === me.id && d.sender_id_str !== me.id
        : d.sender_id_str === me.id,
    );
    return out(filterIds(mine, q));
  }
  if (p === "direct_messages/new") {
    const target = await resolveUser(op, me, q.user_id || q.screen_name || q.user);
    const text = String(q.text ?? "");
    const [a, b] = [bigId(me.id), bigId(target.id)].sort((x, y) => (x < y ? -1 : 1));
    const convId = `${a}-${b}`;
    const res = await op((c) => c.dms.send(convId, text));
    const users = res.users || {};
    const entry = (res.entries || []).find((e) => e.message);
    dmCaches.delete(user());
    const dm = entry
      ? dmFrom(entry, {
          ...users,
          [me.id]: users[me.id] || {
            id_str: me.id,
            screen_name: me.username,
            name: me.name,
            profile_image_url_https: me.profile_picture?.url,
          },
          [target.id]: users[target.id] || {
            id_str: target.id,
            screen_name: target.username,
            name: target.name,
            profile_image_url_https: target.profile_picture?.url,
          },
        })
      : null;
    if (dm) return out(dm);
    const id = String(Date.now());
    return out({
      id: rid(id),
      id_str: id,
      text,
      created_at: classicDate(Date.now()),
      sender_id: rid(me.id),
      recipient_id: rid(target.id),
      sender_screen_name: me.username,
      recipient_screen_name: target.username,
      sender: user2011(me),
      recipient: user2011(target),
    });
  }
  if (parts[0] === "direct_messages" && parts[1] === "destroy") {
    const id = parts[2] || q.id;
    const dm = (dmCaches.get(user())?.list || []).find((d) => d.id_str === String(id));
    await op((c) =>
      c.v1_1(["post", "https://x.com/i/api/1.1/dm/destroy.json"], {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ dm_id: String(id), id: String(id) }).toString(),
      }),
    );
    dmCaches.delete(user());
    return out(
      dm || {
        id: rid(id),
        id_str: String(id),
        text: "",
        created_at: classicDate(Date.now()),
        sender: user2011(me),
        recipient: user2011(me),
        sender_id: rid(me.id),
        recipient_id: rid(me.id),
      },
    );
  }

  if (p.startsWith("trends")) {
    const names = await trendNames(op);
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:00`;
    const list = names.map((name) => ({ name, query: /\s/.test(name) ? `"${name}"` : name }));
    return out({ trends: { [stamp]: list }, as_of: Math.floor(now.getTime() / 1000) });
  }

  const listRoute = parts.length >= 2 && parts[1] === "lists";
  if (listRoute) {
    const owner = await resolveUser(op, me, parts[0]);
    if (parts.length === 2)
      return out({
        lists: listsFrom(
          await op((c) => c.lists.ownerships(owner.id, { count: 50, memberOf: owner.id })),
        ),
        next_cursor: 0,
        previous_cursor: 0,
      });
    if (parts[2] === "memberships")
      return out({
        lists: listsFrom(await op((c) => c.lists.listMemberships(owner.id, { count: 50 }))),
        next_cursor: 0,
        previous_cursor: 0,
      });
    if (parts[2] === "subscriptions") {
      const owned = new Set(
        listsFrom(
          await op((c) => c.lists.ownerships(owner.id, { count: 50, memberOf: owner.id })),
        ).map((l) => l.id_str),
      );
      const combined =
        owner.id === me.id
          ? listsFrom(await op((c) => c.lists.combined({ count: 50 })).catch(() => ({})))
          : [];
      return out({
        lists: combined.filter((l) => !owned.has(l.id_str)),
        next_cursor: 0,
        previous_cursor: 0,
      });
    }
    const listId = /^\d+$/.test(parts[2]) ? parts[2] : null;
    if (listId && parts[3] === "statuses")
      return statuses(
        await paged(`list:${listId}`, q, async (cursor) =>
          parseTimeline(await op((c) => c.lists.timeline(listId, { count: 40, cursor }))),
        ),
      );
    if (listId && parts[3] === "members") {
      const res = await op((c) => c.lists.members(listId, { count: 50 }));
      return out({ users: (res.users || []).map(user2011), next_cursor: 0, previous_cursor: 0 });
    }
    if (listId && parts.length === 3) {
      const found = listsFrom(await op((c) => c.lists.get(listId)));
      return found[0] ? out(found[0]) : fail(404, "Not found");
    }
  }

  return null;
}

export async function handleSearch(q, ctx) {
  const { op } = ctx;
  const query = String(q.q || "").trim();
  const rpp = Math.min(Number(q.rpp) || 20, 100);
  if (!query)
    return out({ results: [], query, page: 1, results_per_page: rpp, since_id: 0, max_id: 0 });
  const tweets = await paged(`search:${query}`, { ...q, count: rpp }, (cursor) =>
    op((c) => c.search.latest(query, { count: 40, cursor })),
  );
  const results = tweets.map((t) => {
    const s = status2011(t.retweeting || t);
    let text = s.text;
    const kept = [];
    for (const u of s.entities.urls) {
      if (u.expanded_url?.startsWith(`${base()}/m/`)) {
        kept.push(u);
      } else if (u.url && u.display_url) {
        text = text.split(u.url).join(u.display_url);
      }
    }
    for (const u of kept) {
      const at = text.lastIndexOf(u.display_url);
      if (at >= 0) u.indices = [at, at + u.display_url.length];
    }
    s.text = text;
    s.entities = { ...s.entities, urls: kept, user_mentions: [] };
    return {
      id: s.id,
      id_str: s.id_str,
      text: s.text,
      created_at: searchDate(t.created_at),
      from_user: s.user.screen_name,
      from_user_id: s.user.id,
      from_user_id_str: s.user.id_str,
      from_user_name: s.user.name,
      to_user: s.in_reply_to_screen_name || null,
      to_user_id: s.in_reply_to_user_id,
      profile_image_url: s.user.profile_image_url,
      source: s.source.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
      iso_language_code: "en",
      geo: null,
      entities: s.entities,
      metadata: { result_type: "recent" },
    };
  });
  const page = Math.max(Number(q.page) || 1, 1);
  return out({
    results,
    max_id: results[0]?.id ?? 0,
    max_id_str: results[0]?.id_str ?? "0",
    since_id: q.since_id ? rid(q.since_id) : 0,
    page,
    query: encodeURIComponent(query),
    results_per_page: rpp,
    next_page: results.length
      ? `?page=${page + 1}&max_id=${results[0]?.id_str}&q=${encodeURIComponent(query)}&rpp=${rpp}`
      : undefined,
    completed_in: 0.042,
  });
}

export function pollFromCard(card) {
  const values = {};
  for (const [k, v] of Object.entries(card?.binding_values || {}))
    values[k] = v?.string_value ?? v?.boolean_value ?? v?.value;
  const c = [];
  for (let i = 1; values[`choice${i}_label`] != null; i++)
    c.push({
      l: decodeEntities(values[`choice${i}_label`]),
      n: Number(values[`choice${i}_count`] || 0),
    });
  return {
    c,
    e: values.end_datetime_utc ? Date.parse(values.end_datetime_utc) || 0 : 0,
    f: values.counts_are_final === true || values.counts_are_final === "true" ? 1 : 0,
    s: Number(values.selected_choice || 0),
  };
}
