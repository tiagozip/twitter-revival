const RID = (d) => (d == null ? null : `@@RID@@${d}`);

export function v1Stringify(obj) {
  return JSON.stringify(obj).replace(/"@@RID@@(\d+)"/g, "$1");
}

const httpVariant = (u) => (typeof u === "string" ? u.replace(/^https:/, "http:") : null);

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function twitterDate(s) {
  if (!s) return "Wed Jun 01 00:00:00 +0000 2011";
  if (/^[A-Z][a-z]{2} [A-Z][a-z]{2} /.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, "0");
  return `${DAY[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
}

export function toV1User(u) {
  if (!u) return null;
  const s = u.stats || {};
  const m = u.misc || {};
  const img = u.profile_picture?.url || null;
  return {
    id: RID(u.id),
    id_str: String(u.id),
    name: u.name ?? "",
    screen_name: u.username ?? "",
    location: u.location ?? "",
    description: u.description ?? "",
    url: u.url || null,
    entities: {
      url: { urls: m.entities?.url?.urls || [] },
      description: { urls: m.entities?.description?.urls || [] },
    },
    protected: !!u.protected,
    followers_count: s.followers?.count ?? 0,
    friends_count: s.following ?? 0,
    listed_count: s.listed ?? 0,
    favourites_count: s.likes ?? 0,
    statuses_count: s.posts ?? 0,
    media_count: s.media ?? 0,
    created_at: twitterDate(u.created_at),
    geo_enabled: false,
    verified: !!(u.verification?.verified || u.verification?.premium_verified),
    profile_image_url_https: img,
    profile_image_url: httpVariant(img),
    profile_banner_url: u.banner || null,
    default_profile: m.default_profile ?? false,
    default_profile_image: m.default_profile_image ?? false,
    following: m.following ?? false,
    follow_request_sent: false,
    notifications: false,
    is_translator: false,
    contributors_enabled: false,
    profile_background_color: "C0DEED",
    profile_link_color: "1DA1F2",
    profile_text_color: "333333",
    profile_sidebar_fill_color: "DDEEF6",
    profile_sidebar_border_color: "C0DEED",
    profile_background_tile: false,
    profile_use_background_image: true,
    utc_offset: null,
    time_zone: null,
    lang: "en",
  };
}

function toV1Media(m) {
  return {
    id: RID(m.id_str),
    id_str: String(m.id_str),
    indices: m.indices || [0, 0],
    media_url: httpVariant(m.media_url_https),
    media_url_https: m.media_url_https,
    url: m.url,
    display_url: m.display_url,
    expanded_url: m.expanded_url,
    type: m.type || "photo",
    sizes: m.sizes || {},
    original_info: m.original_info || undefined,
    features: m.features || {},
    ...(m.video_info ? { video_info: m.video_info } : {}),
  };
}

export function toV1Tweet(t) {
  if (!t) return null;
  const media = (t.media || []).map(toV1Media);
  const entities = {
    hashtags: t.hashtags || [],
    symbols: t.symbols || [],
    urls: t.urls || [],
    user_mentions: t.user_mentions || [],
    ...(media.length ? { media } : {}),
  };
  const out = {
    created_at: twitterDate(t.created_at),
    id: RID(t.id),
    id_str: String(t.id),
    text: t.text ?? "",
    truncated: false,
    entities,
    ...(media.length ? { extended_entities: { media } } : {}),
    source: t.source || "",
    in_reply_to_status_id: RID(t.in_reply_to_status_id),
    in_reply_to_status_id_str: t.in_reply_to_status_id ? String(t.in_reply_to_status_id) : null,
    in_reply_to_user_id: RID(t.in_reply_to_user_id),
    in_reply_to_user_id_str: t.in_reply_to_user_id ? String(t.in_reply_to_user_id) : null,
    in_reply_to_screen_name: t.in_reply_to_screen_name || null,
    user: toV1User(t.user),
    geo: null,
    coordinates: null,
    place: null,
    contributors: null,
    retweet_count: t.stats?.retweets ?? 0,
    favorite_count: t.stats?.likes ?? 0,
    favorited: t.engagement?.liked ?? false,
    retweeted: t.engagement?.retweeted ?? false,
    possibly_sensitive: t.misc?.possibly_sensitive ?? false,
    lang: t.lang || "en",
  };
  const rt = t.retweeting || t.repost || t.retweeted_status;
  if (rt) out.retweeted_status = toV1Tweet(rt);
  if (t.quoting) {
    out.is_quote_status = true;
    out.quoted_status_id = RID(t.quoting.id);
    out.quoted_status_id_str = String(t.quoting.id);
    out.quoted_status = toV1Tweet(t.quoting);
  } else {
    out.is_quote_status = false;
  }
  return out;
}

export function toTimelineHome(emusksTweets) {
  const tweets = {};
  const users = {};
  const timeline = [];
  const collectUsers = (v1) => {
    if (!v1) return;
    if (v1.user) users[v1.user.id_str] = v1.user;
    if (v1.quoted_status) collectUsers(v1.quoted_status);
    if (v1.retweeted_status) collectUsers(v1.retweeted_status);
  };
  for (const t of emusksTweets || []) {
    const v1 = toV1Tweet(t);
    if (!v1) continue;
    collectUsers(v1);
    tweets[v1.id_str] = v1;
    timeline.push({
      tweet: { id: v1.id_str, sort_index: v1.id_str },
      entity_id: { ids: [v1.id_str] },
    });
  }
  return { twitter_objects: { tweets, users }, response: { timeline } };
}
