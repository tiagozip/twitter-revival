import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import parseTimeline from "../node_modules/emusks/src/parsers/timeline.js";
import parseTweet from "../node_modules/emusks/src/parsers/tweet.js";
import parseUser from "../node_modules/emusks/src/parsers/user.js";
import {
  bigId,
  classicDate,
  cursorToken,
  deepCollect,
  fail,
  handleV1,
  listsFrom,
  multipartFile,
  numericCursors,
  out,
  pad,
  paged,
  proxied,
  requestBase,
  requestUser,
  requestEra,
  resolveUser,
  rid,
  status2011,
  user2011,
} from "./v1.js";

const TWEPOCH = 1288834974657n;
const snowflakeMs = (id) => Number((bigId(id) >> 22n) + TWEPOCH);
const msToSnowflake = (ms) => (BigInt(Math.max(Math.floor(ms), Number(TWEPOCH))) - TWEPOCH) << 22n;

const cache = new Map();
async function cached(name, ttl, fn) {
  const key = `${requestBase.getStore() || ""}|${requestEra.getStore() || ""}|${name}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

const statusOf = (t, me) => status2011(t.user ? t : { ...t, user: me });
const usable = (t) => t && !t.tombstone && !t.promoted && t.user;

const entriesOf = (raw) =>
  (
    deepCollect(raw?.data || raw, (o) => Array.isArray(o.instructions))[0]?.instructions || []
  ).flatMap((i) => i.entries || (i.entry ? [i.entry] : []));

const isoStamp = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;

const score = (i) => Number((0.99 - Math.min(i, 90) * 0.01).toFixed(2));

function activity(action, pos, sources, targets, targetObjects) {
  const a = {
    action,
    created_at: pos,
    max_position: String(pos),
    min_position: String(pos),
    sources_size: sources.length,
    sources,
    targets_size: targets.length,
    targets,
  };
  if (targetObjects) {
    a.target_objects_size = targetObjects.length;
    a.target_objects = targetObjects;
  }
  return a;
}

function finishActivities(list, q) {
  const count = Math.min(Math.max(Number(q.count) || 100, 1), 200);
  const sinceId = Number(q.since_id) || 0;
  const maxId = Number(q.max_id) || 0;
  const sorted = list
    .filter((a) => (!sinceId || a.created_at > sinceId) && (!maxId || a.created_at < maxId))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, count);
  let prev = Number.POSITIVE_INFINITY;
  for (const a of sorted) {
    const sec = Math.min(Math.floor(a.created_at / 1000), prev - 1);
    prev = sec;
    a.created_at = classicDate(sec * 1000);
  }
  return sorted;
}

const activityCursors = new Map();
const parentCache = new Map();

async function parentOf(op, id) {
  const key = `${requestUser.getStore() || ""}|${id}`;
  if (parentCache.has(key)) return parentCache.get(key);
  const t = await op((c) => c.tweets.get(id)).catch(() => null);
  parentCache.set(key, t);
  if (parentCache.size > 500) parentCache.delete(parentCache.keys().next().value);
  return t;
}

async function notificationActivity(entry, ctx, budget) {
  const { me, op } = ctx;
  const ic = entry.content?.itemContent;
  const pos = Number(entry.sortIndex) || 0;
  if (!ic || !pos) return null;
  if (ic.itemType === "TimelineTweet") {
    const t = ic.tweet_results?.result ? parseTweet(ic.tweet_results.result) : null;
    if (!usable(t)) return null;
    const source = [user2011(t.user)];
    if (t.in_reply_to_user_id === me.id && t.in_reply_to_status_id) {
      const parent = budget.parents-- > 0 ? await parentOf(op, t.in_reply_to_status_id) : null;
      return activity(
        "reply",
        pos,
        source,
        [statusOf(t, me)],
        [statusOf(parent && !parent.tombstone ? parent : t, me)],
      );
    }
    return activity("mention", pos, source, [user2011(me)], [statusOf(t, me)]);
  }
  if (ic.itemType !== "TimelineNotification") return null;
  const users = (ic.template?.from_users || [])
    .map((u) => u.user_results?.result)
    .filter(Boolean)
    .map(parseUser)
    .map(user2011)
    .filter(Boolean);
  const tweets = (ic.template?.target_objects || [])
    .map((o) => o.tweet_results?.result)
    .filter(Boolean)
    .map(parseTweet)
    .filter((t) => t && !t.tombstone);
  if (!users.length) return null;
  const text = ic.rich_message?.text || "";
  if (ic.notification_icon === "person_icon" && /followed you/i.test(text))
    return activity("follow", pos, users, [user2011(me)]);
  if (!tweets.length) return null;
  const statuses = tweets.map((t) => statusOf(t, me));
  if (ic.notification_icon === "heart_icon") return activity("favorite", pos, users, statuses);
  if (ic.notification_icon === "retweet_icon")
    return activity("retweet", pos, users, statuses, statuses);
  return null;
}

async function aboutMe(q, ctx) {
  const { me, op } = ctx;
  const maxId = Number(q.max_id) || 0;
  const sinceId = Number(q.since_id) || 0;
  const want = Math.min(Number(q.count) || 100, 20);
  let cursor = maxId ? activityCursors.get(`${me.id}|${maxId}`) : undefined;
  const items = [];
  const budget = { parents: 6 };
  for (let pages = maxId && !cursor ? 5 : 3; pages > 0; pages--) {
    const raw = await op((c) => c.notifications.timeline({ count: 40, cursor }));
    const entries = entriesOf(raw);
    const next = entries.find((e) => e.content?.cursorType === "Bottom")?.content.value;
    const page = [];
    for (const e of entries) {
      const a = await notificationActivity(e, ctx, budget);
      if (a) page.push(a);
    }
    for (const a of page) if (next) activityCursors.set(`${me.id}|${a.created_at}`, next);
    if (activityCursors.size > 3000) activityCursors.delete(activityCursors.keys().next().value);
    items.push(...page);
    cursor = next;
    const lowest = Math.min(...entries.map((e) => Number(e.sortIndex) || Number.POSITIVE_INFINITY));
    const kept = items.filter(
      (a) => (!maxId || a.created_at < maxId) && (!sinceId || a.created_at > sinceId),
    ).length;
    if (!cursor || kept >= want || (sinceId && lowest <= sinceId)) break;
  }
  return finishActivities(items, q);
}

async function byFriends(q, ctx) {
  const { me, op } = ctx;
  const window = { count: 200 };
  if (Number(q.max_id)) window.max_id = String(msToSnowflake(Number(q.max_id)));
  if (Number(q.since_id)) window.since_id = String(msToSnowflake(Number(q.since_id)));
  const home = await paged("home", window, (cursor) =>
    op((c) => c.timelines.homeLatest({ count: 40, cursor })),
  );
  const grouped = new Map();
  for (const t of home) {
    if (!t.retweeting || !usable(t) || !usable(t.retweeting) || t.user.id === me.id) continue;
    const g = grouped.get(t.retweeting.id) || { pos: 0, users: new Map(), original: t.retweeting };
    g.pos = Math.max(g.pos, snowflakeMs(t.id));
    g.users.set(t.user.id, t.user);
    grouped.set(t.retweeting.id, g);
  }
  const list = [...grouped.values()].map((g) => {
    const s = statusOf(g.original, me);
    return activity("retweet", g.pos, [...g.users.values()].map(user2011), [s], [s]);
  });
  return finishActivities(list, { ...q, count: Math.min(Number(q.count) || 30, 30) });
}

export async function exploreData(ctx) {
  const { me, op } = ctx;
  return await cached(`explore:${me.id}`, 300_000, async () => {
    const raw = await op((c) => c.trends.explore({ count: 40 }));
    const seen = new Set();
    const trends = [];
    for (const o of deepCollect(raw, (x) => x.itemType === "TimelineTrend" && x.name)) {
      if (seen.has(o.name)) continue;
      seen.add(o.name);
      const link = o.trend_url?.url || o.trend_metadata?.url?.url || "";
      let query = o.name;
      try {
        query =
          new URL(link.replace(/^twitter:\/\//, "http://x/")).searchParams.get("query") || o.name;
      } catch {}
      const posts = /([\d.,]+)\s*([KM]?)\s+posts/i.exec(o.social_context?.text || "");
      const tweetCount = posts
        ? Math.round(
            Number(posts[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6 }[posts[2].toUpperCase()] || 1),
          )
        : 0;
      trends.push({
        name: o.name,
        query,
        ai: !!o.is_ai_trend,
        context: o.social_context?.text || o.trend_metadata?.domain_context || "",
        tweetCount,
        link: /^twitter:\/\/trending\/(\d+)/.exec(link)?.[1] || null,
      });
    }
    const tweetsById = new Map();
    for (const o of deepCollect(raw, (x) => x.tweet_results?.result)) {
      const t = parseTweet(o.tweet_results.result);
      if (usable(t)) tweetsById.set(t.id, t);
    }
    return { trends, tweets: [...tweetsById.values()] };
  });
}

export const suggestedUsers = (ctx) =>
  cached(`connect:${ctx.me.id}`, 600_000, async () => {
    const res = await ctx.op((c) => c.timelines.connect({ count: 30 }));
    const seen = new Set();
    return (res.users || []).filter(
      (u) => u?.id && u.id !== ctx.me.id && !seen.has(u.id) && seen.add(u.id),
    );
  });

function photoMedia(t) {
  const m = (t.media || []).find((x) => x.type === "photo" && x.media_url_https);
  return m
    ? [
        {
          type: "photo",
          media_url: proxied(m.media_url_https),
          media_url_https: proxied(m.media_url_https),
        },
      ]
    : null;
}

async function discovery(ctx) {
  const { me, op } = ctx;
  return await cached(`discovery:${me.id}`, 300_000, async () => {
    const { trends, tweets } = await exploreData(ctx);
    const stories = [];
    for (const t of trends.filter((x) => x.ai).slice(0, 3)) {
      stories.push({
        type: "news",
        data: {
          title: t.name,
          articles: [
            {
              title: t.name,
              description: t.context,
              attribution: "X",
              name: t.name,
              query: t.name,
              tweet_count: t.tweetCount,
              url: {
                display_url: "x.com",
                url: t.link
                  ? `https://x.com/i/trending/${t.link}`
                  : `https://x.com/search?q=${encodeURIComponent(t.name)}`,
                expanded_url: t.link
                  ? `https://x.com/i/trending/${t.link}`
                  : `https://x.com/search?q=${encodeURIComponent(t.name)}`,
              },
            },
          ],
        },
      });
    }
    for (const t of trends.filter((x) => !x.ai).slice(0, 3)) {
      const res = await op((c) => c.search.tweets(t.query, { count: 10 })).catch(() => null);
      const top = (res?.tweets || []).find(
        (x) =>
          usable(x) && !x.retweeting && (photoMedia(x) || (x.quoting && photoMedia(x.quoting))),
      );
      if (!top) continue;
      stories.push({
        type: "topic",
        data: {
          query: t.query,
          name: t.name,
          tweet_count: t.tweetCount,
          media: photoMedia(top) || photoMedia(top.quoting),
          tweet: statusOf(top, me),
        },
      });
    }
    for (const t of tweets.slice(0, 6))
      stories.push({
        type: "tweet",
        data: { status: statusOf(t.retweeting && usable(t.retweeting) ? t.retweeting : t, me) },
      });
    const people = (await suggestedUsers(ctx).catch(() => [])).slice(0, 5).map(user2011);
    if (people.length) stories.push({ type: "user", data: { users: people } });
    const order = [0, 3, 6, 1, 4, 7, 2, 5, 8, 9, 10, 11, 12].map((i) => stories[i]).filter(Boolean);
    const rest = stories.filter((s) => !order.includes(s));
    return [...order, ...rest].map((s, i) => ({ type: s.type, data: s.data, score: score(i) }));
  });
}

async function searchStatuses(q, ctx) {
  const { me, op } = ctx;
  const query = String(q.q || "").trim();
  if (!query) return { statuses: [], stories: [] };
  const rpp = Math.min(Number(q.rpp || q.count) || 20, 100);
  const latest = await paged(`isearch:${query}`, { ...q, count: rpp }, (cursor) =>
    op((c) => c.search.latest(query, { count: 40, cursor })),
  );
  let popular = [];
  if (q.result_type !== "recent" && !q.max_id && !q.since_id && !(Number(q.page) > 1)) {
    const top = await op((c) => c.search.tweets(query, { count: 20 })).catch(() => null);
    popular = (top?.tweets || []).filter((t) => usable(t) && !t.retweeting).slice(0, 3);
  }
  const popularIds = new Set(popular.map((t) => t.id));
  const tag = (t, kind) => ({ ...statusOf(t, me), metadata: { result_type: kind } });
  return {
    statuses: [
      ...popular.map((t) => tag(t, "popular")),
      ...latest
        .filter((t) => usable(t) && !popularIds.has(t.id))
        .slice(0, Math.max(rpp - popular.length, 1))
        .map((t) => tag(t, "recent")),
    ],
    stories: [],
  };
}

async function relatedResults(id, ctx) {
  const { me, op } = ctx;
  const d = await op((c) => c.tweets.detail(id));
  const focal = d.tweets.findIndex((t) => t.id === id);
  const threadIds = new Set(
    d.modules.filter((m) => String(m.id).startsWith("conversationthread")).flatMap((m) => m.tweets),
  );
  const ancestors = focal > 0 ? d.tweets.slice(0, focal) : [];
  const replies = d.tweets.filter((t) => threadIds.has(t.id));
  const seen = new Set();
  const list = [...ancestors, ...replies].filter(
    (t) => usable(t) && t.id !== id && !seen.has(t.id) && seen.add(t.id),
  );
  if (!list.length) return [];
  return [
    {
      resultType: "ReplyResult",
      groupName: "TweetsWithConversation",
      results: list.map((t) => ({ kind: "Tweet", value: statusOf(t, me), annotations: {} })),
    },
  ];
}

async function activitySummary(id, ctx) {
  const { op } = ctx;
  const t = await op((c) => c.tweets.get(id));
  const retweeters = t.stats?.retweets
    ? parseTimeline(await op((c) => c.tweets.retweeters(id, { count: 40 })).catch(() => ({}))).users
    : [];
  return {
    favoriters: [],
    retweeters: retweeters.filter((u) => /^\d+$/.test(String(u?.id))).map((u) => rid(u.id)),
    favoriters_count: String(t.stats?.likes ?? 0),
    retweeters_count: String(t.stats?.retweets ?? 0),
    repliers_count: String(t.stats?.replies ?? 0),
  };
}

async function updateWithMedia(q, ctx) {
  const { me, op, req, log } = ctx;
  const raw = new Uint8Array(await req.arrayBuffer());
  const file = multipartFile(raw, req.headers.get("content-type"), "media");
  log?.(`UPDATE_WITH_MEDIA bytes=${raw.length} file=${file ? file.size : "none"}`);
  if (!file) return fail(400, "Missing media.", 44);
  const uploaded = await op((c) =>
    c.media.create(file, {
      mediaType: file.type && file.type !== "application/octet-stream" ? file.type : "image/jpeg",
    }),
  );
  const mediaId = String(uploaded?.media_id_string || uploaded?.media_id || uploaded?.id || "");
  if (!mediaId) return fail(500, "Upload failed.", 131);
  const text = String(q.status ?? "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const opts = { mediaIds: [mediaId] };
  if (q.in_reply_to_status_id) opts.replyTo = String(q.in_reply_to_status_id);
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

async function trendsFor(ctx) {
  const { trends } = await exploreData(ctx);
  const plain = trends.filter((t) => !t.ai);
  const picked = [...plain, ...trends.filter((t) => t.ai)].slice(0, 20);
  const now = new Date();
  return [
    {
      trends: picked.map((t) => ({ name: t.name, query: encodeURIComponent(t.query) })),
      as_of: isoStamp(now),
      created_at: isoStamp(now),
      locations: [{ name: "Worldwide", woeid: 1 }],
    },
  ];
}

const DATA_DIR = `${import.meta.dir}/../data`;
const SAVED_FILE = `${DATA_DIR}/saved_searches.json`;

function readSaved() {
  try {
    return existsSync(SAVED_FILE) ? JSON.parse(readFileSync(SAVED_FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

function writeSaved(all) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SAVED_FILE, JSON.stringify(all, null, 1));
}

const savedOut = (s) => ({
  id: rid(s.id),
  id_str: s.id,
  name: s.name,
  query: s.query,
  position: null,
  created_at: classicDate(s.at),
});

const accountSettings = new Map();

function settingsBody(me) {
  const saved = accountSettings.get(me.id) || {};
  return {
    geo_enabled: saved.geo_enabled ?? false,
    trend_location: [{ name: "Worldwide", countryCode: null, woeid: 1 }],
    sleep_time: {
      enabled: saved.sleep_enabled ?? false,
      start_time: saved.sleep_start ?? null,
      end_time: saved.sleep_end ?? null,
    },
    screen_name: me.username,
    language: "en",
    protected: !!me.protected,
    always_use_https: false,
    discoverable_by_email: false,
  };
}

function updateSettings(me, q) {
  const saved = { ...(accountSettings.get(me.id) || {}) };
  const hour = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  if (q.geo_enabled != null) saved.geo_enabled = String(q.geo_enabled) === "true";
  if (q.sleep_time_enabled != null) saved.sleep_enabled = String(q.sleep_time_enabled) === "true";
  if (q.start_sleep_time != null) saved.sleep_start = hour(q.start_sleep_time);
  if (q.end_sleep_time != null) saved.sleep_end = hour(q.end_sleep_time);
  accountSettings.set(me.id, saved);
}

const tokensFor = (...texts) => {
  const seen = new Set();
  for (const t of texts)
    for (const w of String(t || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u))
      if (w) seen.add(w);
  return [...seen].map((token) => ({ token }));
};

async function typeahead(q, ctx) {
  const { me, op } = ctx;
  const kinds = String(q.result_type || "users,topics");
  const count = Math.min(Number(q.count) || 200, 400);
  const body = {};
  if (/users/.test(kinds)) {
    const friends = await cached(`typeahead:${me.id}`, 600_000, async () => {
      const all = [];
      let cursor;
      for (let i = 0; i < 4; i++) {
        const res = await op((c) => c.users.following(me.id, { count: 100, cursor }));
        all.push(...(res.users || []));
        cursor = res.nextCursor;
        if (!cursor || !res.users?.length) break;
      }
      return all;
    });
    const needle = String(q.q || "")
      .toLowerCase()
      .replace(/^@/, "");
    body.users = friends
      .filter(
        (u) =>
          u?.id &&
          (!needle ||
            u.username?.toLowerCase().startsWith(needle) ||
            u.name?.toLowerCase().includes(needle)),
      )
      .slice(0, count)
      .map((u, i) => {
        const v = user2011(u);
        return {
          id: v.id,
          id_str: v.id_str,
          name: v.name,
          screen_name: v.screen_name,
          profile_image_url_https: v.profile_image_url_https,
          location: v.location,
          verified: v.verified,
          rounded_score: Math.max(1000 - i, 1),
          rounded_graph_weight: Math.max(1000 - i, 1),
          tokens: tokensFor(v.screen_name, v.name),
        };
      });
  }
  if (/topics/.test(kinds)) {
    const { trends } = await exploreData(ctx).catch(() => ({ trends: [] }));
    body.topics = trends
      .filter((t) => !t.ai)
      .slice(0, 20)
      .map((t, i) => ({ topic: t.query, rounded_score: 100 - i, tokens: tokensFor(t.query) }));
  }
  return body;
}

async function favoriteCreate(id, ctx) {
  const { op } = ctx;
  const t = await op((c) => c.tweets.get(id));
  if (t.engagement?.liked) return fail(403, "You have already favorited this status.", 139);
  try {
    await op((c) => c.tweets.like(id));
  } catch (e) {
    if (/already|139/i.test(String(e?.message || e)))
      return fail(403, "You have already favorited this status.", 139);
    throw e;
  }
  const v = status2011(t);
  v.favorited = true;
  return out(v);
}

async function friendshipUpdate(q, ctx) {
  const { me, op, log } = ctx;
  const u = await resolveUser(op, me, q.user_id || q.screen_name);
  const device = String(q.device) === "true";
  await op((c) =>
    c.v1_1(["post", "https://x.com/i/api/1.1/friendships/update.json"], {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_id: u.id, device: String(device) }).toString(),
    }),
  ).catch((e) => log?.(`friendships/update failed: ${e?.message || e}`));
  const v = user2011(u);
  v.notifications = device;
  return out(v);
}

async function listsV33(parts, q, ctx) {
  const { me, method } = ctx;
  const owner = String(q.user_id || q.screen_name || me.id);
  const listId = String(q.list_id || "");
  const sub = parts.slice(1).join("/");
  const via = (path, extra = {}) => handleV1(path, { ...q, ...extra }, ctx);
  const routed = (p2, extra = {}, m = method) =>
    listRoutes(p2, { ...q, ...extra }, { ...ctx, method: m });
  if (parts.length === 1) return await via(`/1/${owner}/lists.json`);
  if (sub === "memberships" || sub === "subscriptions")
    return await via(`/1/${owner}/lists/${sub}.json`);
  if (sub === "statuses" && listId)
    return await via(`/1/${me.id}/lists/${listId}/statuses.json`, { count: q.count || q.per_page });
  if (sub === "show") {
    if (listId) return await via(`/1/${me.id}/lists/${listId}.json`);
    return await routed(
      [String(q.owner_screen_name || q.owner_id || me.username), "lists", String(q.slug || "")],
      {},
      "GET",
    );
  }
  if (sub === "create") return await routed([me.id, "lists"], {}, "POST");
  if (sub === "update" && listId) return await routed([me.id, "lists", listId], {}, "POST");
  if (sub === "destroy" && listId)
    return await routed([me.id, "lists", listId], { _method: "DELETE" }, "POST");
  const kind = parts[1];
  if ((kind === "members" || kind === "subscribers") && listId) {
    const action = parts[2];
    const target = String(q.user_id || q.screen_name || me.id);
    if (!action) return await routed([me.id, listId, kind], {}, "GET");
    if (action === "show") return await routed([me.id, listId, kind, target], {}, "GET");
    if (action === "create") return await routed([me.id, listId, kind], { id: target }, "POST");
    if (action === "destroy")
      return await routed([me.id, listId, kind], { id: target, _method: "DELETE" }, "POST");
  }
  return null;
}

const blockCursors = new Map();

async function blockTarget(q, ctx, create) {
  const { me, op } = ctx;
  const u = await resolveUser(op, me, q.user_id || q.screen_name || q.id);
  if (!u || u.id === me.id) return fail(403, "You can't block yourself.", 160);
  await op((c) => (create ? c.users.block(u.id) : c.users.unblock(u.id)));
  const v = user2011(u);
  v.following = false;
  return out(v);
}

async function listById(op, listId) {
  return listsFrom(await op((c) => c.lists.get(listId)))[0] || null;
}

async function listRoutes(parts, q, ctx) {
  const { me, op, method } = ctx;
  const post = method === "POST";
  const del = post && String(q._method || "").toUpperCase() === "DELETE";
  if (parts[1] === "lists" && parts.length === 2 && post) {
    const res = await op((c) =>
      c.lists.create(String(q.name || "list"), {
        private: q.mode === "private",
        description: q.description || "",
      }),
    );
    const made = listsFrom(res)[0];
    return made ? out(made) : fail(500, "Could not create list.", 131);
  }
  if (parts[1] === "lists" && parts.length === 3 && /^\d+$/.test(parts[2]) && post) {
    const listId = parts[2];
    const before = await listById(op, listId);
    if (del) {
      await op((c) => c.lists.remove(listId));
      return before ? out(before) : fail(404, "Not found");
    }
    const patch = {};
    if (q.name != null) patch.name = String(q.name);
    if (q.description != null) patch.description = String(q.description);
    if (q.mode) patch.private = q.mode === "private";
    await op((c) => c.lists.update(listId, patch));
    const after = await listById(op, listId);
    return after ? out(after) : fail(404, "Not found");
  }
  if (
    parts[1] === "lists" &&
    parts.length === 3 &&
    !/^\d+$/.test(parts[2]) &&
    !["memberships", "subscriptions"].includes(parts[2])
  ) {
    const slug = parts[2].toLowerCase();
    const bySlug = await op((c) => c.lists.getBySlug(slug, { ownerScreenName: parts[0] })).catch(
      () => null,
    );
    const hit = listsFrom(bySlug).find((l) => l.slug === slug);
    if (hit) return out(hit);
    const owner = await resolveUser(op, me, parts[0]);
    const owned = listsFrom(
      await op((c) => c.lists.ownerships(owner.id, { count: 100, memberOf: owner.id })),
    );
    const found = owned.find((l) => l.slug === slug);
    return found ? out(found) : fail(404, "Not found");
  }
  if (!/^\d+$/.test(parts[1] || "") || !["members", "subscribers"].includes(parts[2])) return null;
  const listId = parts[1];
  const kind = parts[2];
  if (post) {
    if (kind === "members") {
      const u = await resolveUser(op, me, q.id || q.user_id || q.screen_name);
      await op((c) => (del ? c.lists.removeMember(listId, u.id) : c.lists.addMember(listId, u.id)));
    } else {
      await op((c) => (del ? c.lists.unsubscribe(listId) : c.lists.subscribe(listId)));
    }
    const l = await listById(op, listId);
    return l ? out(l) : fail(404, "Not found");
  }
  if (parts[3]) {
    const res = await op((c) =>
      kind === "members"
        ? c.lists.members(listId, { count: 100 })
        : c.lists.subscribers(listId, { count: 100 }),
    );
    const hit = (res.users || []).find(
      (u) => u.id === parts[3] || u.username?.toLowerCase() === parts[3].toLowerCase(),
    );
    return hit
      ? out(user2011(hit))
      : fail(404, "The specified user is not a member of this list", 109);
  }
  const cursor = q.cursor && q.cursor !== "-1" ? numericCursors.get(String(q.cursor)) : undefined;
  if (q.cursor && q.cursor !== "-1" && !cursor)
    return out({ users: [], next_cursor: 0, previous_cursor: 0 });
  const res = await op((c) =>
    kind === "members"
      ? c.lists.members(listId, { count: 50, cursor })
      : c.lists.subscribers(listId, { count: 50, cursor }),
  );
  const users = (res.users || []).map(user2011).filter(Boolean);
  return out({
    users,
    next_cursor: users.length ? cursorToken(res.nextCursor) : 0,
    previous_cursor: 0,
  });
}

export async function handleV3(path, q, ctx) {
  const { me, op, method, ua } = ctx;
  const p = path.replace(/^\/(1\/)?/, "").replace(/\.(json|xml)$/, "");
  const parts = p.split("/");
  const [, major = "0", minor = "0"] = /TwitterAndroid\/(\d+)\.(\d+)/.exec(ua || "") || [];
  const is3 = Number(major) === 3;
  const is33 = Number(major) > 3 || (is3 && Number(minor) >= 3);

  if (p === "i/activity/about_me") return out(await aboutMe(q, ctx));
  if (p === "i/activity/by_friends") return out(await byFriends(q, ctx));
  if (p === "i/discovery") {
    const stories = await discovery(ctx);
    if (!(q.schema === "2" || is33)) return out(stories);
    return out(
      stories
        .filter((s) => s.type !== "tweet")
        .map((s, i) => ({ type: s.type, data: s.data, score: score(i) })),
    );
  }
  if (p === "i/search") {
    const body = await searchStatuses(q, ctx);
    if (q.related_queries === "true") body.related_queries = [];
    if (q.spelling_corrections === "true") body.spelling_corrections = [];
    return out(body);
  }
  if (p === "i/search/typeahead") return out(await typeahead(q, ctx));
  if (p === "i/device_following") return out({ users: [], next_cursor: 0, previous_cursor: 0 });
  if (p === "friends" || p === "followers")
    return await handleV1(`/1/statuses/${p}.json`, { ...q, cursor: q.cursor || "-1" }, ctx);
  if (parts[0] === "lists") {
    const res = await listsV33(parts, q, ctx);
    if (res) return res;
  }
  if (p === "friendships/update") return await friendshipUpdate(q, ctx);
  if (is33 && parts[0] === "favorites" && parts[1] === "create" && (parts[2] || q.id))
    return await favoriteCreate(String(parts[2] || q.id), ctx);
  if (
    parts[0] === "i" &&
    parts[1] === "statuses" &&
    parts[3] === "activity" &&
    parts[4] === "summary"
  )
    return out(await activitySummary(parts[2], ctx));
  if (p === "i/users/email_available")
    return out({ valid: false, msg: "Sign up on x.com, then log in here." });
  if (p === "i/users/username_available")
    return out({ valid: false, msg: "Sign up on x.com, then log in here.", suggestions: [] });
  if (/^(mobile_client_api\/|mobile\/)?decider\/android$/.test(p))
    return out({
      scribe_enabled: false,
      scribe_interval: 3600,
      scribe_crash_sample_size: 0,
      scribe_error_sample_size: 0,
      typeahead_users_ttl: 86400,
      cache_version: 1,
    });

  if (parts[0] === "related_results" && parts[1] === "show" && parts[2])
    return out(await relatedResults(parts[2], ctx));
  if (p === "statuses/update_with_media") return await updateWithMedia(q, ctx);
  if (/^trends\/\d+$/.test(p)) return out(await trendsFor(ctx));

  if (p === "users/recommendations") {
    const limit = Math.min(Number(q.limit) || 20, 30);
    return out(
      (await suggestedUsers(ctx))
        .slice(0, limit)
        .map((u) => ({ user: user2011(u), connections: [], token: `rv${u.id}` })),
    );
  }
  if (p === "users/suggestions" && Number(major) >= 3) {
    const users = (await suggestedUsers(ctx)).slice(0, 20).map(user2011);
    return out([
      {
        name: "Suggested for you",
        slug: "suggested",
        size: users.length,
        sample: users.slice(0, 5),
      },
    ]);
  }

  if (p === "account/settings") {
    if (method === "POST") updateSettings(me, q);
    return out(settingsBody(me));
  }
  if (p === "client_applications/configuration")
    return out({
      short_url_length: 20,
      short_url_length_https: 21,
      characters_reserved_per_media: 20,
      photo_size_limit: 3145728,
      max_media_per_upload: 1,
    });
  if (
    p === "account/push_destinations" ||
    p === "account/push_destinations/destroy" ||
    p === "promoted_content/log"
  )
    return out({});
  if (p === "geo/reverse_geocode") return out({ result: { places: [] } });
  if (p === "urls/shorten") return out({ url: String(q.url || "") });
  if (p === "account/update_profile_image") {
    const raw = new Uint8Array(await ctx.req.arrayBuffer());
    const file = multipartFile(raw, ctx.req.headers.get("content-type"), "image");
    if (!file) return fail(400, "Missing image.", 44);
    await op(async (c) =>
      c.users.updateProfileImage(Buffer.from(await file.arrayBuffer()).toString("base64")),
    );
    const fresh = await op((c) => c.users.get(me.id));
    Object.assign(me, fresh);
    return out(user2011(fresh));
  }

  if (p === "blocks/blocking") {
    const page = Math.max(Number(q.page) || 1, 1);
    const cursor = page > 1 ? blockCursors.get(`${me.id}|${page}`) : undefined;
    if (page > 1 && !cursor) return out([]);
    const res = await op((c) => c.users.blocked({ count: 50, cursor }));
    if (res.nextCursor && res.users?.length)
      blockCursors.set(`${me.id}|${page + 1}`, res.nextCursor);
    return out((res.users || []).map(user2011).filter(Boolean));
  }
  if (p === "blocks/blocking/ids") {
    const res = await op((c) => c.users.blocked({ count: 100 }));
    return out((res.users || []).map((u) => rid(u.id)));
  }
  if (p === "blocks/create" || p === "report_spam") return await blockTarget(q, ctx, true);
  if (p === "blocks/destroy") return await blockTarget(q, ctx, false);
  if (parts[0] === "blocks" && parts[1] === "exists") {
    const u = await resolveUser(op, me, q.user_id || q.screen_name);
    const res = await op((c) => c.users.blocked({ count: 100 }));
    return (res.users || []).some((x) => x.id === u.id)
      ? out(user2011(u))
      : fail(404, "You are not blocking this user.", 34);
  }

  if (p === "saved_searches") {
    const mine = readSaved()[me.id] || [];
    return out(mine.map(savedOut));
  }
  if (p === "saved_searches/create") {
    const query = String(q.query || "").trim();
    if (!query || query.length > 500) return fail(403, "Missing query.", 38);
    const all = readSaved();
    const mine = all[me.id] || [];
    const existing = mine.find((s) => s.query === query);
    if (existing) return out(savedOut(existing));
    if (mine.length >= 25) return fail(403, "You can only save 25 searches.", 172);
    const item = {
      id: String(Math.max(Date.now(), ...mine.map((s) => Number(s.id) + 1))),
      name: query,
      query,
      at: Date.now(),
    };
    all[me.id] = [...mine, item];
    writeSaved(all);
    return out(savedOut(item));
  }
  if (
    parts[0] === "saved_searches" &&
    (parts[1] === "destroy" || parts[1] === "show") &&
    (parts[2] || q.id)
  ) {
    const id = String(parts[2] || q.id);
    const all = readSaved();
    const mine = all[me.id] || [];
    const hit = mine.find((s) => s.id === id);
    if (!hit) return fail(404, "Not found", 34);
    if (parts[1] === "destroy") {
      all[me.id] = mine.filter((s) => s.id !== id);
      writeSaved(all);
    }
    return out(savedOut(hit));
  }

  if (is3 && (p === "statuses/friends" || p === "statuses/followers") && !("cursor" in q))
    q.cursor = "-1";

  if (
    parts.length >= 2 &&
    ![
      "i",
      "lists",
      "statuses",
      "users",
      "favorites",
      "friendships",
      "direct_messages",
      "account",
      "blocks",
      "saved_searches",
      "trends",
      "search",
      "help",
      "geo",
      "related_results",
    ].includes(parts[0])
  ) {
    const res = await listRoutes(parts, q, ctx);
    if (res) return res;
  }

  return null;
}
