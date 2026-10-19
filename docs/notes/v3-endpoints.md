# Twitter for Android 3.0.0 endpoints

The 3.0 routes live in `src/v3.js`. `server.js` sends `/1/`, `/i/` and `/mobile_client_api/` requests to `handleV3` first and falls back to `handleV1` for `/1/` paths that v3 does not claim. Every response goes through the ASCII-escaping `out()` from `v1.js`, and every emusks call goes through `ctx.op`.

## Connect tab

- `GET /i/activity/about_me.json` returns a top-level array of activities built from `client.notifications.timeline`. It maps "followed you" notifications to `follow`, heart notifications to `favorite`, retweet notifications to `retweet`, and tweet entries in the notifications timeline to `reply` (when the tweet replies to one of my tweets) or `mention`. For replies the server fetches the parent tweet for `target_objects`, up to 6 per request with a cache. `action` is always the first key. `max_position` and `min_position` are the entry sortIndex (epoch ms) as a digit string, `created_at` is forced to distinct seconds, `since_id` and `max_id` filter on that position, and `max_id` resumes from the stored notifications cursor. Recommendation, "new post from" and other notification types are dropped because the 3.0 action table has no slot for them.
- `GET /i/activity/by_friends.json` returns `retweet` activities built from the Following timeline, grouped per original tweet with every followed retweeter in `sources`. It is capped at 30 items to stay under the 500000 byte limit. X exposes no feed of what friends liked or followed, so those activity types never appear here.

## Discover and search

- `GET /i/discovery.json` returns a top-level array of stories, cached for 5 minutes. From the ExplorePage response it builds up to 3 `news` stories from AI trends, up to 3 `topic` stories from regular trends (each with a top tweet from a Top search, and a one-item `media` array only when that tweet has a photo), up to 6 `tweet` stories from tweets in the explore payload, and one `user` story from the Connect timeline. `type` precedes `data` and `score` is always a fraction such as `0.97`.
- `GET /i/search.json` returns exactly `{"statuses":[...],"stories":[]}`. `result_type=recent` or any paged request uses Latest search through `paged()`. `mixed` on the first page also puts up to 3 Top results first with `metadata.result_type` set to `popular`. `stories` is always empty.

## Tweet detail

- `GET /1/related_results/show/{id}.json` returns `[]` or one `ReplyResult` group from `client.tweets.detail`. The results list the ancestors of the tweet followed by the tweets in its conversation thread modules. The "related tweets" module and promoted tweets are left out.
- `GET /i/statuses/{id}/activity/summary.json` returns the three counts as strings, `retweeters` as numeric ids from `client.tweets.retweeters` (skipped when the count is 0), and `favoriters` as an empty array because X no longer lists who liked a tweet.

## Posting

- `POST /1/statuses/update_with_media.json` parses the `media[]` part of the multipart body (the `multipartFile` helper in `v1.js` now takes a field name and accepts the `[]` suffix), uploads it with `client.media.create`, creates the tweet with `status` and `in_reply_to_status_id` from the query string, and returns the new status. The photo reaches 3.0 through the same `/m/` payload link that 2.0.1 uses, not through `entities.media`.
- `POST /1/account/update_profile_image.json` reads the `image` part and sends it base64-encoded to `client.users.updateProfileImage`. It has not been tested against the live account.

## Trends, people and settings

- `GET /1/trends/{woeid}.json` returns `[{"trends":[{"name","query"}],"as_of","created_at","locations"}]`. Regular trends come first and AI trends fill the rest, 20 at most. `query` is URL-encoded and `as_of` has no milliseconds. The woeid is ignored because X only returns the account's own explore trends. The old `trends/{digits}` branch in `v1.js` was removed, and `trends/current` for 2.0.1 is unchanged.
- `GET /1/users/recommendations.json` returns `[{"user","connections":[],"token"}]` from the Connect timeline, cached for 10 minutes. X gives no mutual-connection data, so `connections` is always empty.
- `GET /1/users/suggestions.json` adds a 5-user `sample` only when the User-Agent contains `TwitterAndroid/3.`. Other clients still get the 2.0.1 shape. `/1/users/suggestions/{slug}.json` was already correct for 3.0 and still comes from `v1.js`.
- `GET|POST /1/account/settings.json` returns `geo_enabled`, then `trend_location` with `woeid` as the last key, then scalar extras. A POST with `geo_enabled` is kept in memory until the server restarts.
- `GET /1/client_applications/configuration.json` returns scalar config values, including `short_url_length: 20`. `/1/help/configuration.json` is still unhandled because 2.0.1 calls it and I did not want to change what it receives.

## Blocks and saved searches

- `GET /1/blocks/blocking.json` returns an array of users from `client.users.blocked`, and `page` walks the stored cursors. `GET /1/blocks/blocking/ids.json` and `/1/blocks/exists.json` are also answered.
- `POST /1/blocks/create.json` and `/1/blocks/destroy.json` take `user_id` or `screen_name` and return the user. `POST /1/report_spam.json` only blocks the account and does not file a report with X.
- `/1/saved_searches.json`, `/1/saved_searches/create.json`, `/1/saved_searches/destroy/{id}.json` and `/1/saved_searches/show/{id}.json` are stored in `data/saved_searches.json`, keyed by user id. The ids are numeric (creation time in ms). X's saved searches are not synced, and 2.0.1 now reads the same store instead of an always-empty list.

## Other 3.0 calls

- `GET /1/statuses/friends.json` and `/1/statuses/followers.json` from 3.0 always get the cursored `{"users","next_cursor","previous_cursor"}` object, because 3.0 leaves out `cursor` on the first page.
- `/1/{owner}/{list_id}/members.json` and `/subscribers.json` return cursored users. The POST form adds a member or subscribes, and with `_method=DELETE` it removes the member or unsubscribes. `/members/{user}.json` returns 200 or 404. `POST /1/{owner}/lists.json` creates a list, and `POST /1/{owner}/lists/{id}.json` updates it or, with `_method=DELETE`, deletes it. `GET /1/{screen_name}/lists/{slug}.json` resolves the slug through ListBySlug and falls back to the owner's lists. None of the list writes were tested, so the burner account stayed untouched.
- `/i/users/email_available.json` and `/i/users/username_available.json` answer `valid: false`, because signing up has to happen on x.com. `/mobile_client_api/decider/android.json` turns scribe off. `/1/geo/reverse_geocode.json` returns no places. `/1/urls/shorten.json` returns the URL unchanged. `/1/promoted_content/log.json` and `/1/account/push_destinations(.json|/destroy.json)` return `{}`.

## Twitter for Android 3.3.0

3.3.0 builds its User-Agent as `TwitterAndroid/<versionName> (<versionCode>) ...` (`network/o.java:38`), so `handleV3` parses the major and minor version from it. `is3` means any 3.x build and `is33` means 3.3 or newer. Anything that would change what 3.0.0 or 2.0.1 receives is gated on `is33` or on a request parameter that only 3.3 sends.

Changes that apply to every client:

- USER objects from `user2011` and `legacyUser2011` now also carry `url_https`, `blocking`, `can_dm` and `notifications`. `profile_image_url_https` was already present and is the proxied avatar. `notifications` is always false because the parsed emusks user has no device-follow flag.
- Every entry in `entities.urls` now has `url_https`, including the invisible `/m/` payload link and the url entities in 2.0.1 search results. No status sends `entities.media` or a top-level array of objects. The 3.3 checks in the test script confirmed this on home, search, discovery and related_results. Statuses have no `cards`, because the `/m/` payload already renders photos, video, quotes and link cards.
- `friendships/show` adds `blocking` and `can_dm` to `source`.
- `account/settings` puts a `sleep_time` object after `trend_location`, where 3.0 no longer reads anything. A POST also stores `sleep_time_enabled`, `start_sleep_time` and `end_sleep_time`. Like `geo_enabled`, they are kept in memory until the server restarts.
- `mobile_client_api/decider/android.json`, and the `mobile/` variant, returns the flat 3.3 object with scribe off, `typeahead_users_ttl: 86400` and `cache_version: 1`.

New routes:

- `/1/friends.json` and `/1/followers.json` reuse the `statuses/friends` and `statuses/followers` code with the cursor forced, so they always return `{"users","next_cursor","previous_cursor"}`. `/i/device_following.json` is always an empty cursored list.
- The `/1/lists/...` routes are `lists`, `lists/memberships`, `lists/subscriptions`, `lists/statuses?list_id`, `lists/show` (by `list_id`, or by `slug` plus `owner_screen_name`), `lists/create`, `lists/update`, `lists/destroy`, `lists/members`, `lists/subscribers`, and their `create`, `destroy` and `show` sub-routes. They map onto the 3.0 list code. Only the read routes were exercised, and the burner account has no lists.
- `POST /1/friendships/update.json` sends `device` to X's v1.1 `friendships/update` and returns the user with `notifications` set. A failure is logged, and the user is still returned.
- `/i/search/typeahead.json` returns `users` built from the accounts I follow (up to 400, cached for 10 minutes, with lowercase tokens from screen name and name). It filters them by `q` when one is sent. `topics` comes from the regular explore trends.
- 3.3 gets `{"errors":[{"code":139}]}` with status 403 from `favorites/create` when the tweet is already liked. 3.0 and 2.0.1 keep the old behavior.

Response variants:

- With `schema=2` or a 3.3 User-Agent, `/i/discovery.json` drops the `tweet` stories and renumbers the scores. Each remaining story has exactly the keys `type`, `data` and `score`. No `event` stories or `social_proof` are sent. Topic media now carries `media_url_https` too, and news article `url` objects carry `url`.
- `/i/search.json` adds empty `related_queries` and `spelling_corrections` arrays only when the request asks for them, and 3.0 never does. Both arrays are always empty because X gives no data for them.
