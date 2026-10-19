import parseTimeline from "../node_modules/emusks/src/parsers/timeline.js";
import {
  bigId,
  cursorToken,
  fail,
  handleV1,
  listsFrom,
  multipartFile,
  numericCursors,
  out,
  paged,
  resolveUser,
  rid,
  status2011,
  user2011,
} from "./v1.js";
import { exploreData, handleV3, suggestedUsers } from "./v3.js";

const usable = (t) => t && !t.tombstone && !t.promoted && t.user;

const lastRead = new Map();
const searchCursors = new Map();
let searchSeq = 0;

const cursorOf = (q) => {
  const raw = String(q.cursor ?? "-1");
  if (raw === "-1" || raw === "") return { cursor: undefined, ok: true };
  const cursor = numericCursors.get(raw);
  return { cursor, ok: !!cursor };
};

const cursored = (key, items, next) => {
  const token = items.length && next ? String(cursorToken(next)) : "0";
  return out({
    [key]: items,
    next_cursor: rid(token),
    next_cursor_str: token,
    previous_cursor: 0,
    previous_cursor_str: "0",
  });
};

export async function handleV11(path, q, ctx) {
  const { me, op, method, req, log } = ctx;
  const p = path.replace(/^\/(1\.1\/)?/, "").replace(/\.json$/, "");
  const parts = p.split("/");
  const v1 = (sub, extra = {}) => handleV1(`/1/${sub}.json`, { ...q, ...extra }, ctx);
  const v3 = (sub, extra = {}) => handleV3(`/1/${sub}.json`, { ...q, ...extra }, ctx);
  const statuses = (list) => out(list.filter(usable).map(status2011));

  if (p === "i/config")
    return out({
      twitter: {
        short_url_length: 23,
        short_url_length_https: 23,
        characters_reserved_per_media: 23,
        non_username_paths: [],
      },
    });

  if (p === "timeline/home") {
    const list = (
      await paged("home", q, (cursor) => op((c) => c.timelines.homeLatest({ count: 40, cursor })))
    ).filter(usable);
    const tweets = {};
    const users = {};
    const timeline = [];
    const keep = (v) => {
      if (!v?.user) return;
      users[v.user.id_str] = v.user;
      if (v.retweeted_status) keep(v.retweeted_status);
    };
    for (const t of list) {
      const v = status2011(t);
      keep(v);
      tweets[v.id_str] = v;
      timeline.push({
        tweet: { id: v.id_str, sort_index: v.id_str },
        entity_id: { ids: [v.id_str] },
      });
    }
    log?.(`TIMELINE 1.1 home -> ${timeline.length} entries, ${Object.keys(users).length} users`);
    return out({ twitter_objects: { tweets, users }, response: { timeline } });
  }
  if (p === "statuses/home_timeline") return await v1("statuses/home_timeline");
  if (p === "statuses/user_timeline") return await v1("statuses/user_timeline");
  if (p === "statuses/mentions_timeline") return await v1("statuses/mentions");
  if (p === "statuses/show") return await v1("statuses/show");
  if (p === "statuses/media_timeline") {
    const u = await resolveUser(op, me, q.user_id || q.screen_name);
    return statuses(
      await paged(`media:${u.id}`, q, (cursor) =>
        op((c) => c.users.userMedia(u.id, { count: 40, cursor })),
      ),
    );
  }
  if (p === "statuses/update") return await v1("statuses/update");
  if (p === "statuses/update_with_media") return await v3("statuses/update_with_media");
  if (
    parts[0] === "statuses" &&
    (parts[1] === "retweet" || parts[1] === "destroy") &&
    /^\d+$/.test(parts[2] || "")
  )
    return await v1(p);
  if (parts[0] === "statuses" && parts[2] === "activity" && parts[3] === "summary")
    return await handleV3(`/i/statuses/${parts[1]}/activity/summary.json`, q, ctx);
  if (p === "statuses/report_spam") return out({});

  if (p === "conversation/show") {
    const id = String(q.id || "");
    if (!/^\d+$/.test(id)) return fail(404, "No status found with that ID.", 144);
    const d = await op((c) => c.tweets.detail(id));
    const focal = d.tweets.findIndex((t) => t.id === id);
    const thread = new Set(
      d.modules
        .filter((m) => String(m.id).startsWith("conversationthread"))
        .flatMap((m) => m.tweets),
    );
    const sinceId = q.since_id ? bigId(q.since_id) : null;
    const maxId = q.max_id ? bigId(q.max_id) : null;
    const seen = new Set();
    const list = [
      ...(focal >= 0 ? d.tweets.slice(0, focal + 1) : []),
      ...d.tweets.filter((t) => thread.has(t.id)),
    ]
      .filter((t) => usable(t) && !seen.has(t.id) && seen.add(t.id))
      .filter((t) => (!sinceId || bigId(t.id) > sinceId) && (!maxId || bigId(t.id) <= maxId))
      .sort((a, b) => (bigId(b.id) > bigId(a.id) ? 1 : -1))
      .slice(0, Math.min(Number(q.count) || 20, 100));
    return statuses(list);
  }

  if (p === "favorites/list")
    return await v1("favorites", { id: q.user_id || q.id || q.screen_name || me.id });
  if (p === "favorites/create") return await v3("favorites/create");
  if (p === "favorites/destroy") return await v1("favorites/destroy");

  if (p === "friends/list" || p === "followers/list") {
    const u = await resolveUser(op, me, q.user_id || q.screen_name);
    const { cursor, ok } = cursorOf(q);
    if (!ok) return cursored("users", [], null);
    const res = await op((c) =>
      parts[0] === "friends"
        ? c.users.following(u.id, { count: 50, cursor })
        : c.users.followers(u.id, { count: 50, cursor }),
    );
    return cursored("users", (res.users || []).map(user2011).filter(Boolean), res.nextCursor);
  }
  if (p === "friendships/lookup") {
    const ids = String(q.user_id || "")
      .split(",")
      .filter((x) => /^\d+$/.test(x))
      .slice(0, 100);
    const names = String(q.screen_name || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 100);
    const found = [
      ...(ids.length ? await op((c) => c.users.getMany(ids)) : []),
      ...(names.length ? await op((c) => c.users.getManyByUsername(names)) : []),
    ].filter((u) => u?.id);
    return out(
      found.map((u) => {
        const connections = [
          u.misc?.following && "following",
          u.misc?.followed_by && "followed_by",
          u.misc?.blocking && "blocking",
        ].filter(Boolean);
        return {
          id: rid(u.id),
          id_str: String(u.id),
          name: u.name,
          screen_name: u.username,
          connections: connections.length ? connections : ["none"],
        };
      }),
    );
  }
  if (p === "friendships/incoming" || p === "friendships/outgoing")
    return cursored("ids", [], null);
  if (p === "friendships/accept" || p === "friendships/deny")
    return fail(404, "There are no pending follow requests here.", 34);
  if (
    p === "friendships/create" ||
    p === "friendships/destroy" ||
    p === "friendships/show" ||
    p === "friendships/create_all"
  )
    return await v1(p);
  if (p === "friendships/update") return await v3(p);

  if (p === "users/show" || p === "users/lookup" || p === "users/search") return await v1(p);
  if (parts[0] === "users" && parts[1] === "suggestions") return (await v3(p)) ?? (await v1(p));
  if (p === "users/recommendations") return await v3(p);
  if (p === "users/report_spam") return await v3("report_spam");
  if (p === "users/send_invites_by_email") return out({});

  if (p === "search/universal") {
    const query = String(q.q || "").trim();
    if (q.prev_cursor) return out({ modules: [], metadata: { cursor: String(q.prev_cursor) } });
    const prev = q.next_cursor ? searchCursors.get(String(q.next_cursor)) : null;
    if (!query || (q.next_cursor && !prev)) return out({ modules: [], metadata: { cursor: "" } });
    const kind =
      prev?.kind ||
      (q.modules === "user"
        ? "users"
        : q.filter === "images"
          ? "media"
          : q.result_type === "recent"
            ? "latest"
            : "tweets");
    const res = await op((c) => c.search[kind](query, { count: 20, cursor: prev?.cursor }));
    const modules =
      kind === "users"
        ? (res.users || []).filter((u) => u?.id).map((u) => ({ user: { data: user2011(u) } }))
        : (res.tweets || []).filter(usable).map((t) => ({ status: { data: status2011(t) } }));
    let cursor = "";
    if (res.nextCursor && modules.length) {
      cursor = `rv${++searchSeq}`;
      searchCursors.set(cursor, { kind, cursor: res.nextCursor });
      if (searchCursors.size > 500) searchCursors.delete(searchCursors.keys().next().value);
    }
    log?.(`SEARCH 1.1 ${kind} -> ${modules.length}`);
    return out({ modules, metadata: { cursor } });
  }
  if (p === "search/typeahead")
    return await handleV3(
      "/i/search/typeahead.json",
      {
        ...q,
        result_type: q.result_type === "all" || !q.result_type ? "users,topics" : q.result_type,
      },
      ctx,
    );
  if (p === "search/tweets") return await handleV3("/i/search.json", q, ctx);

  if (p === "saved_searches/list") return await v3("saved_searches");
  if (parts[0] === "saved_searches") return await v3(p);

  if (p === "activity/about_me/unread") {
    if (method === "POST") lastRead.set(me.id, Number(q.ts) || Date.now());
    return out({ cursor: lastRead.get(me.id) ?? 0 });
  }
  if (p === "activity/about_me" || p === "activity/by_friends")
    return await handleV3(`/i/${p}.json`, q, ctx);

  if (p === "discover/universal") {
    const meta = { prev_cursor: "rv", next_cursor: "" };
    if (q.next_cursor) return out({ modules: [], metadata: meta });
    const { tweets } = await exploreData(ctx);
    const modules = tweets
      .slice(0, 20)
      .map((t) => ({ status: { data: status2011(usable(t.retweeting) ? t.retweeting : t) } }));
    const people = (await suggestedUsers(ctx).catch(() => [])).slice(0, 3);
    if (people.length)
      modules.splice(Math.min(3, modules.length), 0, {
        wtf: { data: { users: people.map((u) => ({ user: user2011(u), token: `rv${u.id}` })) } },
      });
    return out({ modules, metadata: meta });
  }

  if (
    p === "direct_messages" ||
    p === "direct_messages/sent" ||
    p === "direct_messages/new" ||
    p === "direct_messages/destroy"
  )
    return await v1(p);
  if (p === "direct_messages/read") return out({});

  if (parts[0] === "lists" && ["ownerships", "memberships", "subscriptions"].includes(parts[1])) {
    const owner = await resolveUser(op, me, q.user_id || q.screen_name);
    if (String(q.cursor ?? "-1") !== "-1") return cursored("lists", [], null);
    const owned = () => op((c) => c.lists.ownerships(owner.id, { count: 50, memberOf: owner.id }));
    if (parts[1] === "ownerships") return cursored("lists", listsFrom(await owned()), null);
    if (parts[1] === "memberships")
      return cursored(
        "lists",
        listsFrom(await op((c) => c.lists.listMemberships(owner.id, { count: 50 }))),
        null,
      );
    if (owner.id !== me.id) return cursored("lists", [], null);
    const mine = new Set(listsFrom(await owned()).map((l) => l.id_str));
    return cursored(
      "lists",
      listsFrom(await op((c) => c.lists.combined({ count: 50 })).catch(() => ({}))).filter(
        (l) => !mine.has(l.id_str),
      ),
      null,
    );
  }
  if (p === "lists/statuses" && /^\d+$/.test(String(q.list_id))) {
    const listId = String(q.list_id);
    return statuses(
      await paged(`list:${listId}`, { ...q, count: q.count || q.per_page }, async (cursor) =>
        parseTimeline(await op((c) => c.lists.timeline(listId, { count: 40, cursor }))),
      ),
    );
  }
  if (
    (p === "lists/members" || p === "lists/subscribers") &&
    method === "GET" &&
    /^\d+$/.test(String(q.list_id))
  ) {
    const listId = String(q.list_id);
    const { cursor, ok } = cursorOf(q);
    if (!ok) return cursored("users", [], null);
    const res = await op((c) =>
      parts[1] === "members"
        ? c.lists.members(listId, { count: 50, cursor })
        : c.lists.subscribers(listId, { count: 50, cursor }),
    );
    return cursored("users", (res.users || []).map(user2011).filter(Boolean), res.nextCursor);
  }
  if (parts[0] === "lists") return await v3(p);

  if (p === "account/verify_credentials" || p === "account/update_profile") return await v1(p);
  if (p === "account/settings" || p === "account/update_profile_image") return await v3(p);
  if (p === "account/update_profile_banner") {
    const file = multipartFile(
      new Uint8Array(await req.arrayBuffer()),
      req.headers.get("content-type"),
      "banner",
    );
    if (!file) return fail(400, "Missing banner.", 44);
    await op(async (c) =>
      c.users.updateProfileBanner(Buffer.from(await file.arrayBuffer()).toString("base64")),
    );
    return out({});
  }
  if (p === "account/remove_profile_banner") {
    await op((c) => c.users.removeProfileBanner());
    return out({});
  }
  if (parts[0] === "account" && parts[1]?.startsWith("login_verification")) return out({});
  if (p === "application/rate_limit_status") return await v1("account/rate_limit_status");

  if (p === "trends/available")
    return out([
      {
        name: "Worldwide",
        country: "",
        countryCode: null,
        woeid: 1,
        parentid: 0,
        placeType: { code: 19, name: "Supername" },
        url: "",
      },
    ]);
  if (p === "geo/reverse_geocode" || p === "blocks/create" || p === "blocks/destroy")
    return await v3(p);

  if (p === "help/experiments") return out({ experiments: [] });
  if (parts[0] === "prompts" || p === "promoted_content/log") return out({});

  return null;
}
