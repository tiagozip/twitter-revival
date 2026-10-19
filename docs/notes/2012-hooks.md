# Twitter 3.3.0 (July 2012): hook points and API differences

Name map from 3.0.0:

| 3.0.0                                                        | 3.3.0                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `com/twitter/android/provider/ax` (row model)                | `com/twitter/android/provider/m`                                |
| `com/twitter/android/widget/c` (row provider iface)          | `com/twitter/android/widget/am`                                 |
| `com/twitter/android/client/g` (client, implements provider) | `com/twitter/android/client/b` (also `com/twitter/android/bi`)  |
| `be` (entities)                                              | `com/twitter/android/api/TweetEntities` (real field names)      |
| `s` (photo services)                                         | `com/twitter/android/util/j`                                    |
| `Cdo` / `bq` (parser, bundled Jackson)                       | `com/twitter/android/api/r` / `org/codehaus/jackson/JsonParser` |
| `platform/m` (contacts sync)                                 | `platform/c` (data sync, see 4)                                 |

Jackson method names in 3.3.0: `a()` nextToken, `b()` skipChildren, `c()` currentToken, `d()` getCurrentName, `f()` getText, `g()` getIntValue, `h()` getLongValue, `i()` getDoubleValue, `j()` getBooleanValue.

## 1. TweetView (`com/twitter/android/widget/TweetView.smali`)

`public class TweetView extends View`, same StaticLayout design as 3.0.

### Bind

`.method public final a(Lcom/twitter/android/provider/m;)V` (`.locals 12`, so `p0`=v12, `p1`=v13). It ends with a single call to `b()`, which loads the avatar:

```smali
    :cond_5
    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V

    return-void
```

Anchor (1 occurrence), identical text to 3.0:

```python
patch(s, ".method public final a(Lcom/twitter/android/provider/m;)V",
    "    :cond_5\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n",
    "    :cond_5\n    invoke-static {p0, p1}, Lrevival/InlineMedia;->bind(Landroid/view/View;Ljava/lang/Object;)V\n\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n")
```

### onDraw

`.method protected onDraw(Landroid/graphics/Canvas;)V` (`.locals 9`). The only `return-void` is the early/final block, and every draw path jumps back to it with `goto/16 :goto_0`:

```smali
    :cond_0
    :goto_0
    return-void
```

Anchor `"    :cond_0\n    :goto_0\n    return-void\n"` (1 occurrence), same as 3.0.

### onMeasure

`.method protected onMeasure(II)V` (`.locals 23`). The single measure call, where `v0` holds `this` from the `move-object/from16 v0, p0` right above it:

```smali
    :goto_5
    move-object/from16 v0, p0

    move/from16 v1, v17

    invoke-virtual {v0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V

    return-void
```

Anchor `"    invoke-virtual {v0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V\n"` (1 occurrence). The 3.0 replacement block works unchanged because v0, v1 and v2 are free after this call.

### Fields

| field | type             | meaning                                                                                                                                                                                                                 |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d`   | `provider/m`     | bound tweet row                                                                                                                                                                                                         |
| `e`   | `widget/am`      | provider. `am` has `a()J` (owner id), `a(m)Bitmap` (avatar), `b(m)Lcom/twitter/android/api/TweetEntities;` (entities). `InlineMedia.findPayload` finds it as is: method named `b`, one param, param `isInstance(tweet)` |
| `c`   | static Drawable  | avatar frame (styleable index 0xa). Its intrinsic width sets the text x offset. It is the only static Drawable                                                                                                          |
| `k`   | static TextPaint | shared paint                                                                                                                                                                                                            |
| `m`   | float            | content and name text size (index 4, default 14.0; `a(F)` sets `sp*scaledDensity`)                                                                                                                                      |
| `p`   | float            | byline text size (index 6, default 12.0; `a(F)` sets `(sp-2)*scaledDensity`)                                                                                                                                            |
| `g`   | StaticLayout     | name (bold, size `m`), line 1                                                                                                                                                                                           |
| `f`   | StaticLayout     | `@screen_name`, drawn to the right of `g` on line 1                                                                                                                                                                     |
| `i`   | StaticLayout     | relative time, right aligned on line 1                                                                                                                                                                                  |
| `h`   | StaticLayout     | tweet content (size `m`), line 2                                                                                                                                                                                        |
| `O`   | Drawable         | pill/badge background (promoted, political, top tweet, "retweeted by" all share it), line 3. Bounds are set in onMeasure to its intrinsic size                                                                          |
| `j`   | StaticLayout     | pill text (`S` string: "Promoted by", "Top tweet" or "Retweeted by X"), drawn inside `O`'s row, vertically centered, so it adds no height                                                                               |
| `L`   | int              | gap above the pill (index 0x19)                                                                                                                                                                                         |
| `K`   | int              | avatar and line 1 top offset (index 0x15)                                                                                                                                                                               |
| `x`   | int              | icon spacing (index 9)                                                                                                                                                                                                  |
| `M`   | Drawable         | loaded avatar BitmapDrawable                                                                                                                                                                                            |
| `N`   | Drawable         | dogear (fav/RT), top right                                                                                                                                                                                              |
| `P`   | Drawable         | reply/location/media icon, next to the time                                                                                                                                                                             |
| `Q`   | Drawable         | avatar overlay                                                                                                                                                                                                          |

Note: 3.0's separate "retweeted by" StaticLayout is gone. In 3.3.0 the retweeted-by line is the pill row (`O` plus `j`).

### Text geometry (from onDraw and onMeasure)

- x offset of name/content/pill: `paddingLeft + (M ?: c).getIntrinsicWidth() + paddingLeft` (onDraw, smali lines after `Canvas.restore()` following the avatar draw). onMeasure lays out `h` with width `W - padL - padR - (padL + c.intrinsicWidth)`, so use `c`.
- Text bottom: `paddingTop + g.height + h.height + (O != null ? L + O.bounds.height : 0)`. onMeasure computes the same sum plus paddings.

Proposed `apps/2012/spec/revival/Spec.java` values:

```java
public static final String ROW_PROVIDER = "e";
public static final String ROW_TEXT_SIZE = "m";
public static final String ROW_SMALL_SIZE = "p";

public static int rowTextBottom(View row) {
    int bottom = row.getPaddingTop() + Reflect.layoutHeight(row, "g") + Reflect.layoutHeight(row, "h");
    if (Reflect.get(row, "O") != null) bottom += (int) Reflect.number(row, "L", 0) + Reflect.layoutHeight(row, "O");
    return bottom;
}

public static int rowContentLeft(View row) {
    return row.getPaddingLeft() * 2 + Reflect.staticDrawableWidth(row.getClass(), "c");
}
```

`Reflect.number` returns the fallback for 0, which is fine here because a 0 gap adds nothing.

## 2. Photo-service URL check

`com/twitter/android/util/j.smali`, `.method public static b(Ljava/lang/String;)Z` (line 1008, `.locals 6`). It calls `c(String)I` (yfrog, twitpic, plixi, photozou, twitgoo, dailybooth prefixes). Callers:

- `api/TweetEntities$Media.a(TweetEntities$Url)` (entities parser): if `b(expanded_url ?: url)` is true, the url becomes a `Media` with `mediaUrl = j.a(url)`. `j.a` returns the url unchanged for unknown prefixes.
- `api/r` topic story parser (`I`, jadx r.java:740): adds story media to the tweet only when `b()` is FALSE.

The rename trick applies mechanically (no internal callers of `b` inside `j.smali`):

```python
edit("com/twitter/android/util/j.smali", lambda s: s.replace(
    ".method public static b(Ljava/lang/String;)Z\n",
    f""".method public static b(Ljava/lang/String;)Z
    .registers 8

    const-string v0, "http://127.0.0.1:{port}/"

    invoke-virtual {{p0, v0}}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :revival_not_ours

    const/4 v0, 0x1

    return v0

    :revival_not_ours
    invoke-static {{p0}}, Lcom/twitter/android/util/j;->revival_b(Ljava/lang/String;)Z

    move-result v0

    return v0
.end method

.method public static revival_b(Ljava/lang/String;)Z
""", 1))
```

I don't recommend applying it by default in 3.3.0. `TweetEntities.a` keeps every url entity in `urls` (Media entries are added to both `urls` and `media`), so `Extras.payloadFromEntities` already finds a `/m/` payload url in `urls` without the trick. With the trick, the status parser (`r.a(JsonParser, ac)`, jadx r.java:1558) turns `entities.media[0]` into a native photo card (`TweetMedia` type 1, `imageUrl = mediaUrl`), and it then nulls `entities.media`. The detail screen would then fetch the `/m/...` payload url as an image. If you do apply it, the server must answer `/m/...` with `Content-Type: image/*`.

## 3. Tweet detail preview

3.3.0 has no `@id/image_preview` and no private `a(entities, client)` method. Layout `res/layout/tweet_detail_view.xml`:

```
TweetDetailView (CardRowView)
  RelativeLayout @id/content_area
    RelativeLayout @id/badge          (avatar, name, screen name)
    LinearLayout  @id/tweet_content   (vertical, layout_below=badge)
      TextView @id/content            (tweet text, 18sp serif)
      Button   @id/promoted_tweet
      TextView @id/byline
      TextView @id/retweet
  (card preview added at runtime into content_area, layout_below=@id/tweet_content)
```

Native media now comes from `TweetMedia[] m.M` (status `cards`, or `entities.media[0]`). `TweetDetailView.a(TweetMedia, client/b)` inflates `photo_preview`, `player_preview` or `summary_preview` into `content_area`.

Hook method, called once per detail view from `com/twitter/android/fq.getView` as `a(mVar, bVar, fragment, bVar.b(mVar))`:

`com/twitter/android/widget/TweetDetailView.smali`
`.method public final a(Lcom/twitter/android/provider/m;Lcom/twitter/android/client/b;Lcom/twitter/android/widget/ad;Lcom/twitter/android/api/TweetEntities;)V` (`.locals 9`, entities in `p4` = v13)

```smali
    :goto_3
    return-void
```

```python
patch(s, ".method public final a(Lcom/twitter/android/provider/m;Lcom/twitter/android/client/b;Lcom/twitter/android/widget/ad;Lcom/twitter/android/api/TweetEntities;)V",
    "    :goto_3\n    return-void\n",
    "    :goto_3\n    invoke-static {p0, p4}, Lrevival/Detail;->attachView(Landroid/view/View;Ljava/lang/Object;)V\n\n    return-void\n")
```

`Detail.attachView` needs a change for 3.3.0: it hardcodes `image_preview` and hides it. Make the anchor id a Spec constant (`"content"`) and add a flag so it does not hide the anchor. With anchor `content` the parent is the vertical LinearLayout `tweet_content`, so the existing LinearLayout branch inserts the extras view right after the tweet text.

## 4. Sync adapter

There is no contacts sync adapter in 3.3.0. The only `AbstractThreadedSyncAdapter` is `com/twitter/android/platform/c.smali`, created by `platform/TwitterDataSyncService` (authority `com.twitter.android.provider.TwitterProvider`, account type `com.twitter.android.auth.login`, meta-data `android.content.SyncAdapter` plus `android.provider.CONTACTS_STRUCTURE`).

```smali
.method public final onPerformSync(Landroid/accounts/Account;Landroid/os/Bundle;Ljava/lang/String;Landroid/content/ContentProviderClient;Landroid/content/SyncResult;)V
```

It calls `c.a(network.d, Account, Bundle, SyncResult)`, which polls home_timeline, DMs, `/i/activity/about_me` and `/i/discovery` and posts notifications. TwitterService action `REFRESH` also calls it directly. Don't noop it the way `02-no-contacts-sync.sh` does for 3.0, or background refresh and notifications stop. If contacts are the concern, drop the `CONTACTS_STRUCTURE` meta-data from the manifest instead.

## 5. 140-char constants

| file                                               | line | smali                   | method                               |
| -------------------------------------------------- | ---- | ----------------------- | ------------------------------------ |
| `com/twitter/android/PostActivity.smali`           | 1246 | `rsub-int v2, v0, 0x8c` | `e()V` counter text `140 - n`        |
| same                                               | 1258 | `const/16 v2, 0x8c`     | `e()V` send enabled if `n <= 140`    |
| same                                               | 2037 | `const/16 v1, 0x8c`     | `onCreate` initial counter text      |
| same                                               | 3344 | `const/16 v1, 0x8c`     | `onEditorAction` send-on-enter check |
| `com/twitter/android/MessagesThreadActivity.smali` | 153  | `const/16 v1, 0x8c`     | `j()Z` send enabled                  |
| same                                               | 379  | `rsub-int v1, v1, 0x8c` | `b(I)V` counter text                 |
| same                                               | 657  | `const/16 v1, 0x8c`     | `onCreate` initial counter text      |

No other compose screen has a limit. `com/twitter/android/util/a.smali:3379` `const/16 v1, 0x8c` is an HTML entity table index (`rsquo`), so leave it alone. The 3.0 `modern.py` replacements for `const/16 v1|v2` work as is. The `rsub-int` literals were not patched in 3.0, so the counter shows 140-based numbers. `rsub-int` takes a 16-bit literal, so `0x118` and `0x2710` fit.

## 6. Navbar

`com/twitter/android/widget/Navbar extends RelativeLayout`. Home (`res/layout/home_tab_activity.xml`):

```xml
<com.twitter.android.widget.Navbar android:id="@id/navbar" style="?attr/navbarStyle">
    <ImageView android:layout_alignParentLeft="true" style="@style/NavbarLogo" />
    <ImageButton android:id="@id/title_button_2" android:src="@drawable/ic_title_search" android:layout_toLeftOf="@id/title_button_3" style="@style/IconTitleBtn" />
    <ImageButton android:id="@id/title_button_3" android:src="@drawable/ic_title_tweet" android:layout_alignParentRight="true" style="@style/IconTitleBtn" />
</com.twitter.android.widget.Navbar>
```

Other screens `<include android:id="@id/navbar" layout="@layout/navbar" />`, which adds `@id/title` (TextView, `toLeftOf=title_button_2`) plus the same two buttons. There are no separator views: no `title_sep_*` ids exist, and the `NavbarSep` style is only used in `widget_header.xml`. The button background `@drawable/btn_title_icon` carries the divider.

```java
public static final String MENU_ANCHOR = "navbar";
public static final String[] MENU_LEFT_OF = {"title_button_2", "title_button_3"};
public static final String MENU_SEPARATOR = "";
public static final String MENU_STYLE_FROM = "title_button_3";
```

On `title`-bearing screens MenuButton rewires `title`'s `LEFT_OF` from `title_button_2` to the new button. Screens where `title_button_3` is a text `Button` (post, drafts, login, messages thread) are skipped by the `ImageButton` check.

## 7. Hosts

`res/values/strings.xml`, same keys as 3.0, so `01-hosts.sh` works for these:

| key                                          | value                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `base_host`                                  | `https://api.twitter.com` (all `/i/...` and `/oauth/access_token`)                    |
| `base_url`                                   | `https://api.twitter.com/1`                                                           |
| `base_url_mobile`                            | `https://mobile.twitter.com/mobile_client_api` (signup, decider)                      |
| `base_url_upload`                            | `https://upload.twitter.com/1` (update_with_media, read in TwitterService.smali:3516) |
| `oauth_echo_url_json` / `oauth_echo_url_xml` | `https://api.twitter.com/1/account/verify_credentials.json                            | .xml` (twitpic/yfrog echo) |
| `profile_image_url`                          | `https://api.twitter.com/1/users/profile_image?screen_name=%s&size=original`          |

Smali const-strings:

| file                                                  | string                                          | action                                                                              |
| ----------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `com/twitter/android/util/j.smali:151`                | `"http://api.twitpic.com/2/upload.xml"`         | repoint (moved from `s.smali`)                                                      |
| `com/twitter/android/util/j.smali:329`                | `"http://yfrog.com/api/xauth_upload"`           | repoint                                                                             |
| `com/twitter/android/service/ScribeService.smali:626` | `"https://twitter.com/scribe"`                  | repoint. The host changed from 3.0's `scribe.twitter.com`, so the 3.0 sed misses it |
| `com/twitter/android/network/a.smali:614,671`         | `"http://api.twitter.com/"`                     | OAuth realm, leave                                                                  |
| `com/twitter/android/network/ssl/b.smali:25`          | `"api.twitter.com"`                             | TLS pinning host set, irrelevant over http                                          |
| `com/twitter/android/util/j.smali:25`                 | `http://maps.google.com/maps/api/staticmap?...` | static map, optional                                                                |

Nothing references `search.twitter.com`.

## 8. Package-rename collisions

- Provider authorities: `com.twitter.android.provider.TwitterProvider`, `com.twitter.android.provider.GlobalDatabaseProvider` (76 and 6 smali const-strings, plus `content://` URIs in `provider/*.smali`, `res/xml/searchable.xml`, `res/xml/people_searchable.xml`, `res/xml/sync_data_adapter.xml`).
- Permissions: `com.twitter.android.permission.READ_DATA`, `.RESTRICTED`, `.C2D_MESSAGE`, `.AUTH_APP`.
- Account type: `com.twitter.android.auth.login` (30 smali strings, `res/xml/authenticator.xml`, `res/xml/sync_data_adapter.xml`).
- The regex in the 3.0 rename patch, now `apps/common/rename_package.sh`, covers all three groups. No smali const-string equals the bare package `com.twitter.android`, except the C2DM `<category>` in the manifest, which is harmless.
- Custom attr namespace: 29 layouts (33 res files) use `xmlns:twitter="http://schemas.android.com/apk/res/com.twitter.android"`, so the res-auto rewrite is needed.

## 9. Application class

The manifest declares `android:name=".TwitterApplication"`, so `patchlib.modernize` exits with "app already has an Application class". `com/twitter/android/TwitterApplication.smali`:

```smali
.class public Lcom/twitter/android/TwitterApplication;
.super Landroid/app/Application;
.method public constructor <init>()V        # invoke-direct {p0}, Landroid/app/Application;-><init>()V
.method public onCreate()V                  # .locals 1
    invoke-super {p0}, Landroid/app/Application;->onCreate()V
    new-instance v0, Lcom/twitter/android/ge;   # crash handler that scribes the throwable
    invoke-direct {v0, p0}, Lcom/twitter/android/ge;-><init>(Landroid/content/Context;)V
    invoke-static {v0}, Ljava/lang/Thread;->setDefaultUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)V
    return-void
```

Nothing casts `getApplication()` to it. The simplest hook is to re-parent it onto `revival.App` (make `App` non-final, which it already is) by replacing the three `Landroid/app/Application;` references in `.super`, `<init>` and `onCreate`'s `invoke-super` with `Lrevival/App;`, and to let `modernize` accept an existing `android:name` when it finds `.TwitterApplication`. It still needs `usesCleartextTraffic="true"` added. `hardwareAccelerated="true"` is already set.

## 10. API differences vs the 3.0 API spec

The HTTP layer (`network/c`) is unchanged: same Content-Type whitelist, 500000-byte cap, gzip, only 200 is success. Headers are the same (`network/o.a(c)`), with `X-Twitter-Polling: True` on sync-adapter calls and on GETs made with the `z=true` flag (config, account/settings GET, decider). Almost every status request now adds `include_cards=true`.

### Endpoint list (TwitterService action, method, path)

`S` = signed (OAuth header), `U` = unsigned, `F` = form body, `Q` = query only.

| action                                                                                                                                    | request                                                                                                                                                                                                                                                         | parser                                                                                                                           | status                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --- |
| HOME (46)                                                                                                                                 | S GET `/1/statuses/home_timeline.json` count, max_id, since_id, lat, long, include_entities, include_my_retweet, include_cards, `pc=true` when max_id <= 0                                                                                                      | ARR STATUS                                                                                                                       | params new                                                                    |
| USER_TIMELINE (6)                                                                                                                         | S GET `/1/statuses/user_timeline.json` user_id, include_rts; `mentions`, `retweeted_by_me`, `retweeted_to_me`, `retweets_of_me`, `show/{id}`                                                                                                                    | ARR STATUS / STATUS                                                                                                              | + include_cards                                                               |
| GET_FAVS (9)                                                                                                                              | S GET `/1/favorites.json` id, page                                                                                                                                                                                                                              | ARR STATUS                                                                                                                       | same                                                                          |
| CREATE_FAV (7)                                                                                                                            | S POST `/1/favorites/create/{id}.json?send_error_codes=true` F impression_id?, include_entities, include_cards                                                                                                                                                  | STATUS; on non-200 `{"errors":[{"code":NUM}]}`, code 139 (already favorited) keeps the local favorite, any other code reverts it | CHANGED                                                                       |
| DESTROY_FAV (8)                                                                                                                           | S POST `/1/favorites/destroy/{id}.json` F impression_id?                                                                                                                                                                                                        | body ignored                                                                                                                     | same                                                                          |
| RETWEET (25)                                                                                                                              | S POST `/1/statuses/retweet/{id}.json` F impression_id?, include_entities, include_cards                                                                                                                                                                        | STATUS                                                                                                                           | same                                                                          |
| DESTROY_STATUS (26)                                                                                                                       | S POST `/1/statuses/destroy/{id}.json`                                                                                                                                                                                                                          | STATUS                                                                                                                           | same                                                                          |
| TWEET (24)                                                                                                                                | S POST `/1/statuses/update.json` Q status, include_entities, include_cards, in_reply_to_status_id?, impression_id?, lat/long? ; with photo and `i_type==2`: `upload/statuses/update_with_media.json` multipart `media[]`                                        | STATUS                                                                                                                           | same                                                                          |
| GET_MESSAGES / SENT (16/17)                                                                                                               | S GET `/1/direct_messages.json`, `/1/direct_messages/sent.json` since_id, max_id, count, include_entities                                                                                                                                                       | ARR DM                                                                                                                           | same                                                                          |
| NEW_DM (19)                                                                                                                               | S POST `/1/direct_messages/new.json` F user_id or screen_name, text, include_entities                                                                                                                                                                           | DM                                                                                                                               | same                                                                          |
| DESTROY_DM (20)                                                                                                                           | S POST `/1/direct_messages/destroy/{id}.json`                                                                                                                                                                                                                   | ignored                                                                                                                          | same                                                                          |
| GET_USERS (12)                                                                                                                            | S GET `/1/friends.json`, `/1/followers.json`, or `/i/device_following.json` with user_id, count?, cursor                                                                                                                                                        | `{"users":[USER],"next_cursor":NUM}`                                                                                             | PATHS CHANGED (3.0: `/1/statuses/friends.json`, `/1/statuses/followers.json`) |
| GET_LISTS (11)                                                                                                                            | S GET `/1/lists.json`, `/1/lists/memberships.json`, `/1/lists/subscriptions.json` user_id, cursor?                                                                                                                                                              | `{"lists":[LIST],"next_cursor":NUM}`                                                                                             | PATHS CHANGED (3.0: `/1/{uid}/lists...`)                                      |
| CREATE_LIST / EDIT_LIST (30/31)                                                                                                           | S POST `/1/lists/create.json` or `/1/lists/update.json?list_id=` F name, mode, description?                                                                                                                                                                     | LIST                                                                                                                             | CHANGED                                                                       |
| DELETE_LIST (32)                                                                                                                          | S POST `/1/lists/destroy.json?list_id=`                                                                                                                                                                                                                         | LIST                                                                                                                             | CHANGED                                                                       |
| GET_LIST_TWEETS (33)                                                                                                                      | S (or U if logged out) GET `/1/lists/statuses.json` list_id, since_id?, max_id?, per_page, include_entities, include_cards                                                                                                                                      | ARR STATUS                                                                                                                       | CHANGED                                                                       |
| GET_LIST_USERS (34)                                                                                                                       | S GET `/1/lists/members.json` or `/1/lists/subscribers.json` list_id, cursor?                                                                                                                                                                                   | cursored users                                                                                                                   | CHANGED                                                                       |
| ADD_LIST_USER (35)                                                                                                                        | GET users/show, then S POST `/1/lists/members/create.json` F list_id, user_id; or `/1/lists/subscribers/create.json` F list_id                                                                                                                                  | LIST                                                                                                                             | CHANGED                                                                       |
| REMOVE_LIST_USER (36)                                                                                                                     | S POST `/1/lists/members/destroy.json` F list_id, user_id; or `/1/lists/subscribers/destroy.json` F list_id                                                                                                                                                     | LIST                                                                                                                             | CHANGED                                                                       |
| IS_LIST_USER (37)                                                                                                                         | S GET `/1/lists/members/show.json` or `/1/lists/subscribers/show.json` user_id, list_id                                                                                                                                                                         | 200 yes, 404 no                                                                                                                  | CHANGED                                                                       |
| GET_LIST (53)                                                                                                                             | U GET `/1/lists/show.json` slug, owner_screen_name                                                                                                                                                                                                              | LIST (needs `id`, `user.id`)                                                                                                     | CHANGED                                                                       |
| FOLLOW (14)                                                                                                                               | S POST `/1/friendships/create.json` F user_id, follow=true?                                                                                                                                                                                                     | USER                                                                                                                             | same                                                                          |
| UNFOLLOW (15)                                                                                                                             | S POST `/1/friendships/destroy.json` F user_id                                                                                                                                                                                                                  | USER                                                                                                                             | same                                                                          |
| UPDATE_FRIENDSHIP (76)                                                                                                                    | S POST `/1/friendships/update.json` F user_id, device=true                                                                                                                                                                                                      | false                                                                                                                            | USER                                                                          | NEW |
| FOLLOW_ALL (56)                                                                                                                           | S POST `/1/friendships/create_all.json?user_id=1,2,...`                                                                                                                                                                                                         | `[{"id":NUM}]`                                                                                                                   | same                                                                          |
| GET_FRIENDSHIP (22)                                                                                                                       | S or U GET `/1/friendships/show.json` source_id, target_id                                                                                                                                                                                                      | see below                                                                                                                        | CHANGED (more bits)                                                           |
| GET_USER (23)                                                                                                                             | S GET `/1/users/show.json` screen_name or user_id                                                                                                                                                                                                               | USER                                                                                                                             | same                                                                          |
| LOOKUP (54)                                                                                                                               | S GET `/1/users/lookup.json` user_id, email, phone                                                                                                                                                                                                              | ARR USER                                                                                                                         | same                                                                          |
| SEARCH_USERS (40)                                                                                                                         | S or U GET `/1/users/search.json` q, per_page, page                                                                                                                                                                                                             | ARR USER                                                                                                                         | same                                                                          |
| GET_BLOCKING (13)                                                                                                                         | S GET `/1/blocks/blocking.json` page?                                                                                                                                                                                                                           | ARR USER                                                                                                                         | same                                                                          |
| CREATE_BLOCK / REPORT_SPAM (27/28)                                                                                                        | S POST `/1/blocks/create.json` F user_id or `/1/report_spam.json` F id, `?impression_id`                                                                                                                                                                        | USER                                                                                                                             | same                                                                          |
| DESTROY_BLOCK (29)                                                                                                                        | S POST `/1/blocks/destroy.json` F user_id                                                                                                                                                                                                                       | ignored                                                                                                                          | same                                                                          |
| GET_TRENDS (38)                                                                                                                           | S GET `/1/trends/{woeid}.json` pc=1?                                                                                                                                                                                                                            | same as 3.0                                                                                                                      | same (objects inside trend skipped now)                                       |
| SEARCH_TWEETS (39)                                                                                                                        | S GET `/i/search.json` q, result_type=recent (q_type 5 only), lang?, locale?, since_id?, rpp, max_id?, show_user?, geocode?; page 1 adds stories, related_queries=true, spelling_corrections=true, pc=true; always include_entities, include_cards, events=true | see below                                                                                                                        | CHANGED; `/1/promoted_tweets/search.json` is no longer called                 |
| TYPEAHEAD (75)                                                                                                                            | S GET `/i/search/typeahead.json` prefetch=true, result_type=users                                                                                                                                                                                               | topics, count?                                                                                                                   | see below                                                                     | NEW |
| ACTIVITY (64)                                                                                                                             | S GET `/i/activity/about_me.json` or `by_friends.json` include_entities, include_cards, count, max_id?, since_id?                                                                                                                                               | same as 3.0                                                                                                                      | + include_cards                                                               |
| FETCH_STORIES (65)                                                                                                                        | S GET `/i/discovery.json` lat?, long?, lang?, `schema=2`                                                                                                                                                                                                        | see below                                                                                                                        | CHANGED                                                                       |
| RELATED_RESULTS (66)                                                                                                                      | U GET `/1/related_results/show/{id}.json` include_entities, include_cards                                                                                                                                                                                       | same as 3.0                                                                                                                      | + params                                                                      |
| ACTIVITY_SUMMARY (70)                                                                                                                     | S GET `/i/statuses/{id}/activity/summary.json`                                                                                                                                                                                                                  | same                                                                                                                             | same                                                                          |
| GET_USER_RECOMMENDATIONS (67)                                                                                                             | S GET `/1/users/recommendations.json` connections, user_id?, limit?, pc=1                                                                                                                                                                                       | same                                                                                                                             | + pc                                                                          |
| GET_SLUG (51)                                                                                                                             | U GET `/1/users/suggestions.json` lang, country, localize, samples, sample_size                                                                                                                                                                                 | same                                                                                                                             | same                                                                          |
| GET_SLUG_USERS (52)                                                                                                                       | S GET `/1/users/suggestions/{slug}.json`                                                                                                                                                                                                                        | same (arrays other than `users` skipped)                                                                                         | same                                                                          |
| GET/SAVE/DELETE saved searches (50/62/63)                                                                                                 | S GET `/1/saved_searches.json`, POST `create.json` F query, POST `destroy/{id}.json`                                                                                                                                                                            | same                                                                                                                             | same                                                                          |
| GET/UPDATE_SETTINGS (59/58)                                                                                                               | S GET (polling header) / POST `/1/account/settings.json` F geo_enabled, sleep_time_enabled, start_sleep_time?, end_sleep_time?, time_zone?                                                                                                                      | see below                                                                                                                        | CHANGED                                                                       |
| CONFIG (57)                                                                                                                               | S GET (polling) `/1/client_applications/configuration.json`                                                                                                                                                                                                     | `short_url_length`                                                                                                               | same                                                                          |
| RATE_LIMIT (10)                                                                                                                           | S GET `/1/account/rate_limit_status.json`                                                                                                                                                                                                                       | same                                                                                                                             | same                                                                          |
| DECIDER (61)                                                                                                                              | U GET (polling) `mobile/decider/android.json`                                                                                                                                                                                                                   | see below                                                                                                                        | CHANGED                                                                       |
| VERIFY (43), LOGIN (44), SIGNUP (55), EMAIL/USERNAME_AVAILABLE (68/69), SHORTEN_URL (21), REVERSE_GEO (42), UPDATE_PROFILE (41), LOG (45) | same as 3.0                                                                                                                                                                                                                                                     | same                                                                                                                             | same                                                                          |
| EditProfile (`com/twitter/android/ap.java`)                                                                                               | S POST `/1/account/update_profile_image.json` multipart `image`                                                                                                                                                                                                 | USER                                                                                                                             | same                                                                          |
| C2DMService                                                                                                                               | POST `/1/account/push_destinations.json` udid, enabled_for, lang?, token? (304 also ok); `/push_destinations/destroy.json` udid                                                                                                                                 | ignored                                                                                                                          | + lang                                                                        |
| ScribeService                                                                                                                             | POST `https://twitter.com/scribe`, form body, signed when logged in                                                                                                                                                                                             | ignored                                                                                                                          | host changed                                                                  |

Sync adapter (`platform/c`) calls: home_timeline (`include_entities`, count 100 or since_id, `pc=true`, lat/long), DMs, `/i/activity/about_me.json?include_entities&since_id&count=20`, `/i/discovery.json?lang&schema=2`, all with the polling header.

### Changed response shapes

**USER** (`r.a(JsonParser, long)`, r.java:1574):

- `profile_image_url` is NOT read anymore. Only `profile_image_url_https` sets the avatar. Send it (an `http://127.0.0.1` url is fine; the name is just the key).
- `url_https` is preferred, and `url` is the fallback.
- New BOOL keys: `blocking` (bit 4), `can_dm` (bit 8), `notifications` (bit 16, the device-follow bit), alongside `following`, `followed_by`.
- New OBJ `promoted_content` `{"impression_id":STR,"disclosure_type":STR}`. `status` OBJ is unchanged. Other objects are skipped.

**STATUS** (`r.a(JsonParser, ac)`, r.java:1253):

- New OBJ `cards` (see CARDS). The first card becomes the tweet detail preview.
- New status-level OBJ `promoted_content` `{"impression_id","disclosure_type"}`. `disclosure_type:"political"` gives the gov badge. `entities.promoted_content` is now skipped.
- After parsing, if `entities.media` is non-empty and there are no cards, `media[0]` becomes a photo card (`url`, `media_url(_https)`, `sizes.large.w/h`), and `entities.media` is then set to null. Media entities stay in `entities.urls`.
- Top-level arrays of objects are not skipped (no START_ARRAY case), so don't put arrays of objects at status top level. Arrays of scalars are harmless. `id` is still a required NUM, and `id_str` is ignored.

**ENTITIES** (`TweetEntities.a`, jadx TweetEntities.java:163):

- `urls[]`: `url_https` is preferred and `url` is the fallback. `expanded_url`, `display_url` and `indices` are also read.
- `media[]`: `url_https` (fallback `url`), `media_url_https` (fallback `media_url`), `expanded_url`, `display_url`, `type:"photo"`, `id` NUM, `indices`, `sizes.large.{w,h}` NUM.
- `user_mentions[]`: `screen_name`, `id`, `indices`.
- `hashtags` and every other key are skipped.

**CARDS** (`r.A`, `r.c(JsonParser,int)`):

```json
{"photos":[{"url":"STR","title":"STR","description":"STR",
            "images":{"mobile":{"image_url":"STR","image_url_2x":"STR","width":1,"height":1}},
            "site_user":{USER},"author_user":{USER}}],
 "players":[{"url":"..","title":"..","images":{"mobile":{..}},
             "players":[{"source_url":"STR","source_type":"video/mp4; codecs=\"avc1.42E01E\""}]}],
 "summaries":[{"url":"..","title":"..","description":"..","images":{"mobile":{..}}}]}
```

A photo needs `image_url` or `image_url_2x`. A player needs a `source_type` of `text/html` (becomes the player url) or a stream type (`video/mp4`+`avc1.42E0`, `audio/mp3`, `audio/aac`, `audio/mp4`+`mp4a.40.2`, `audio/ogg`+`vorbis`). A summary needs `title` or `description`. `image_url_2x` is used when density > 1. The detail loads the image with a plain GET, which needs `image/*`. Other top-level card keys must not be arrays of objects.

**FRIENDSHIP** (`r.j`): `{"relationship":{"source":{"following":true,"followed_by":true,"blocking":true,"can_dm":true}}}`. Only `true` values set bits.

**SEARCH** `/i/search.json` (`r.s`): top-level OBJECT.

- `statuses`: ARR STATUS. It is optional now, and a missing key no longer crashes.
- `stories`: ARR of STORY (schema 2, below). `stories[0]` is the header story.
- `related_queries`: `[{"query":STR}]`.
- `spelling_corrections`: `[{"query":STR,"indices":[[s,e],...]}]`.
- Promoted tweets are regular statuses carrying `promoted_content.impression_id`.
- The top-level loop still has no object skip, so no top-level objects (e.g. `search_metadata`).

**DISCOVERY** `/i/discovery.json?schema=2` (`r.t`, `r.G`): a top-level ARRAY of stories. It works for both TwitterService (two `nextToken`) and the sync adapter (one `nextToken`). Story:

| key            | type  | notes                                                                                                           |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`         | STR   | `news`=1, `topic`=2, `user`=3, `event`=4. `tweet` is gone and such stories are dropped. Must come before `data` |
| `data`         | OBJ   | by type, below                                                                                                  |
| `social_proof` | OBJ   | `{"social_proof_type":"social"                                                                                  | "query","referenced_by":{"statuses":[STATUS],"global_count":NUM}}`. Null unless the type is set and statuses are non-empty |
| `score`        | FLOAT | must have a decimal point                                                                                       |

Any other OBJ key in a story is NOT skipped, so keep only these.

- news: `{"title":STR,"articles":[ARTICLE]}`. ARTICLE is unchanged from 3.0 (`title`, `description`, `attribution`, `query`, `name`, `tweet_count`, `score`, `media`, `url{display_url,expanded_url,url}`).
- topic: `{"query","name","tweet_count","media":[MEDIA],"tweet":{STATUS}}`. The empty-`media` IndexOutOfBounds gotcha still applies (r.java:739).
- user: `{"users":[USER]}`.
- event: `{"events":[{"id":STR,"title":STR,"description":STR,"media":{"thumbnail":{"url":STR,"width":NUM,"height":NUM}},"urls":{"m5":{"url":STR,"display_url":STR}}}]}`. Only the first event is used.
- MEDIA: `type`, `media_url_https` or `media_url`, `sizes.large.url_https|url` overrides.

**TYPEAHEAD** `/i/search/typeahead.json` (`r.z`, `P`, `Q`): `{"users":[{"id":NUM,"name","screen_name","profile_image_url_https","location","verified":BOOL,"rounded_score":NUM,"rounded_graph_weight":NUM,"tokens":[{"token":STR}]}],"topics":[{"topic":STR,"rounded_score":NUM,"tokens":[{"token":STR}]}]}`. Items without `tokens` are dropped.

**ACCOUNT SETTINGS** (`api/af.a`, token map `api/ah`): `{"geo_enabled":BOOL,"sleep_time":{"enabled":BOOL,"start_time":NUM,"end_time":NUM},"trend_location":[{"woeid":NUM}]}`. Unknown objects and arrays are now skipped, so the 3.0 key-order trap is gone. String values at top level are ignored.

**DECIDER** (`r.q`): `{"scribe_enabled":true,"scribe_interval":NUM,"scribe_crash_sample_size":NUM,"scribe_error_sample_size":NUM,"typeahead_users_ttl":NUM,"cache_version":NUM}`. Intervals are in seconds. `cache_version` defaults to -1. There is no object skip, so keep it flat.

**FAVORITE ERROR** (`r.y`): `{"errors":[{"code":139,"message":".."}]}`. Code 139 (already favorited) keeps the local favorite state, and any other code reverts it.

Unchanged from API-SPEC: activity items (same action table and key-order rule), DMs, trends, related_results, activity summary, recommendations, suggestions, saved searches, LIST object (`id`, `name`, `full_name`, `description`, `mode`, `member_count`, `subscriber_count`, `user`), PLACE (`place_type` must still be one of the five values, r.java:232 unboxes a null Integer), xAuth and signup.

## 11. Modern-device issues

- px dimensions: only `res/values-hdpi-v4/dimens.xml` `divider_thickness` = `1.0px` (the base value is `1.0dp`). `px-to-dp` converts it. There are also two layout attrs in px (`post_layout.xml` `twitter:shadowRadius="0.5px"` and one `twitter:shadowDy="-1.0px"`), which are cosmetic, plus `0.0px` paddings.
- `Notification.setLatestEventInfo` is called at `com/twitter/android/client/b.smali:508, 582, 10656` with `new Notification(int, CharSequence, long)`. The method was removed from the platform in API 23, so posting a notification throws NoSuchMethodError. The 3.0 build tree has the same unpatched calls. I didn't verify this on a device.
- `android.util.FloatMath.ceil` is used in `TweetView.a(String,TextPaint)` and in `CardRowView` (3 calls). It is the same call 3.0 already runs with.
- Apache HttpClient: fine at targetSdk 24 (only removed for targetSdk 28 and up).
- C2DM: `startService(new Intent("com.google.android.c2dm.intent.REGISTER"))` is an implicit service intent, guarded by `C2DMService.a(context)`, the same as 3.0.
- Theme is `@android:style/Theme.Light` with `windowNoTitle`, and there is no action bar, so the hardware-menu-only options menu needs MenuButton (6).
- `HomeTabActivity extends TabActivity` with `IconTabHost` and a `tabbar_height` TabWidget, the same pattern as 3.0.
