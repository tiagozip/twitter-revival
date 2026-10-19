# Twitter 4.1.9 (October 2013): modern-feature hook points

Sources: apktool tree `apps/2014/build/tree` (smali paths below are relative to `smali/`) after patches 00 to 03, and jadx at `scratchpad/jadx419/sources`. `patches/modern.py` checks every anchor below for uniqueness inside its method, checks the method's `.locals` count, and checks that every reflected field exists. It exits non-zero if any of them changed.

## 1. TweetView (`com/twitter/library/widget/TweetView.smali`)

`public class TweetView extends View`. It is one custom-drawn view per timeline row (`tweet_row_view_tweet.xml`, `tweet_row_view_conv_tweet.xml`, `conversation_row.xml`, `message_row_view.xml`) and the overlay in the photo pager (`photo_pager_tweet.xml`, id `tweet`). The bound object is `com/twitter/library/provider/Tweet`. Its subclass `ThreadTweet` also goes through `setTweet`, so `Reflect` now walks superclasses when it looks up a field.

The row layout is not the 3.x model. Under the tweet text, onMeasure stacks the native media preview, the promoted or pill badge and the inline action row (reply, retweet, favorite), and every one of them is positioned from one local, `i21` (header plus text height). So the extras are inserted between the text and everything below it, by growing `i21` in onMeasure and growing the matching `height4` in onDraw. The old `InlineMedia.extraHeight`/`draw` pair, which only appends at the bottom, would end up below the action row.

### Bind

`.method public setTweet(Lcom/twitter/library/provider/Tweet;)V` (`.locals 17`, so `p0`=v17, `p1`=v18). The native media block decides `bQ` (0 none, 1 photo, 2 summary card, 3 player) and all its branches join at:

```smali
    :cond_8
    :goto_2
    move-object/from16 v0, p1

    iget-wide v4, v0, Lcom/twitter/library/provider/Tweet;->j:J
```

The patch inserts `invoke-static/range {p0 .. p1}, Lrevival/InlineMedia;->bind(...)V` after the two labels. The range form needs no scratch register. This point is inside the `if (bs)` block (the tweet changed), and it comes before `bQ` is read again for the text variant and the media badge icon, so the hook can switch the native preview off (see 3).

### onMeasure

`.method protected onMeasure(II)V` (`.locals 45`). `v20` is the text width (`iMax2 = max(W - padL - padR - (M + P + O), 0)`), and it is never reassigned. Anchor:

```smali
    :goto_10
    add-int v28, v5, v21
```

`v28` is `i21`. The patch appends `v28 += InlineMedia.space(this, v20)` using `v0` and `v2` as scratch. Both are written again by the next two instructions (`move-object/from16 v0, p0`, `iget-object v2, v0, ...->aB`). `space` returns 0 without a payload, otherwise the 7dp gap plus the laid-out height. The native preview rect `bL`, the card rect `bo`, the pill rect `cg`, the inline action rects and the measured height all derive from `i21`, so they all move down.

### onDraw

`.method protected onDraw(Landroid/graphics/Canvas;)V` (`.locals 29`). After the content StaticLayout `aF` is drawn, `v4` is the text bottom (scrollY and paddingTop included) and `v14` is the text x. Both paths (with and without `aF`) join at:

```smali
    :cond_b
    if-eqz v3, :cond_33
```

The patch inserts `v4 += InlineMedia.drawAt(this, canvas, v14, v4)` using `v0` and `v1` as scratch. dx only uses them as `move-object/from16` temporaries in this method, and both successors (`zA` branch and `:cond_33` -> `move v10, v4` -> `:goto_f`) write `v0` before they read it. `v3` (zA) and `v8` (paint) are untouched. Below this point the native media is drawn from the rects computed in onMeasure, and the badge position derives from `v4`, so both stay in step with the measure pass. `drawAt` reuses the `Laid` cached by `space`, so the drawn height always equals the measured height.

### Fields

| field         | type             | meaning                                                                                   |
| ------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `aA`          | `provider/Tweet` | bound tweet                                                                               |
| `aX`          | float            | content and name text size (`ROW_TEXT_SIZE`)                                              |
| `aT`          | float            | screen name, time and badge text size (`ROW_SMALL_SIZE`)                                  |
| `M`, `P`, `O` | int              | avatar left margin, avatar width, avatar right margin. Text x = `paddingLeft + M + P + O` |
| `cc`          | Rect             | content text rect, set at the end of onMeasure (`rowTextBottom`)                          |
| `bQ`          | int              | native media mode, 0 none, 1 photo, 2 summary card, 3 player                              |
| `aF`          | StaticLayout     | tweet text                                                                                |
| `bL`          | Rect             | native photo or player preview rect                                                       |

`Tweet` fields: `A` TweetEntities (`ROW_ENTITIES`, the `urls` list holds the `/m/` entity), `N` TwitterStatusCard (`N.media` is the native TweetMedia, built from `entities.media[0]` or a card), `H` int flags (bit 64 is possibly_sensitive, `Tweet.p()`).

`Spec.ROW_PROVIDER` is empty for this era, which makes `InlineMedia.findPayload` read `tweet.A` instead of calling a provider method.

## 2. Tweet detail (`com/twitter/applib/widget/TweetDetailView.smali`)

Same shape as 3.3.0. `res/layout/tweet_detail_view.xml`:

```
TweetDetailView (RelativeLayout)
  SocialBylineView @id/social_byline
  RelativeLayout @id/badge                  (avatar, name, screen name)
  LinearLayout @id/tweet_content            (vertical, below badge)
    TextView @id/content                    (tweet text)
    (revival ExtrasView inserted here)
  LinearLayout @id/preview_and_byline       (below tweet_content)
    LinearLayout @id/preview_container      (field r, native photo/player/summary, gone by default)
    promoted_tweet, cluster_badge, byline
  LinearLayout @id/stats_container
```

Bind hook, called from `com/twitter/applib/mp.getView` as `a(tweet, client, fragment, tweet.A)`:
`.method public a(Lcom/twitter/library/provider/Tweet;Lcom/twitter/applib/client/a;Lcom/twitter/library/widget/ab;Lcom/twitter/library/api/TweetEntities;)V` (`.locals 8`, `p0`=v8, `p4`=v12, both below v16 so the non-range invoke is valid). It stores the tweet in field `h` first. Single exit:

```smali
    :goto_4
    invoke-virtual {p0}, Lcom/twitter/applib/widget/TweetDetailView;->a()V

    .line 211
    return-void
```

The patch inserts `Detail.attachView(p0, p4)` before `a()`. `DETAIL_ANCHOR = "content"`, so the LinearLayout branch of `attachView` adds the extras right under the text.

Native preview hook: `.method private a(Landroid/view/ViewGroup;)V` (`.locals 2`) is the only place that fills `r` and makes it visible (`r.addView(p1)`, `r.setVisibility(0)`). It is called later and asynchronously by `b(client/a)`, from `TweetFragment` and from the sensitive-media warning. The patch appends `Spec.detailNative(p0)` after the `setVisibility` call, which hides `r` again when the extras replace the native media. `Spec.detailPayload` applies the same rule when `attachView` runs, so the order of the two calls does not matter.

## 3. Native media vs payload photos

4.1.9 has one native media slot per tweet (`Tweet.N.media`), so a 2 to 4 photo tweet shows only the first photo natively. The rules live in `Spec.rowPayload` and `Spec.detailPayload`:

- No native media: the whole payload renders, photos included.
- Native media present and the payload has 2 or more photos or a video: timeline rows set `bQ` to 0 when it was 1 or 3 (native preview on), so the native preview is skipped and the extras draw the full grid or the video. The detail screen hides `preview_container`. If the timeline preview was already off (`bQ` 0, for example sensitive media with the setting off) or the detail tweet is sensitive, photos are dropped and the native behavior stays.
- Otherwise `p` is dropped from a copy of the payload, and the native preview shows the single photo. Video, quote, poll, card and note still render.
- The photo pager overlay (`TweetView` with id `tweet`) gets no extras.

With `bQ` forced to 0, setTweet picks the media badge icon next to the timestamp (`bd`) and the full text variant, and onLayout skips the native image fetch.

## 4. Spec values

```java
public static final String DETAIL_ANCHOR = "content";
public static final boolean DETAIL_HIDE_ANCHOR = false;
public static final String ROW_PROVIDER = "";
public static final String ROW_ENTITIES = "A";
public static final String ROW_TEXT_SIZE = "aX";
public static final String ROW_SMALL_SIZE = "aT";
```

`rowTextBottom` reads `cc.bottom` and `rowContentLeft` is `paddingLeft + M + P + O`. The smali hooks don't use either one, since they pass the text x and bottom directly, but they match what onMeasure computes.

## 5. Changes to the common classes

- `Reflect.field` walks superclasses (needed for `ThreadTweet`), and `Reflect.setInt` is new.
- `InlineMedia`: `space(View, int)` and `drawAt(View, Canvas, int, int)` for rows that stack content under the text. `bind` passes the payload through `Spec.rowPayload`, and `findPayload` reads `Spec.ROW_ENTITIES` when `ROW_PROVIDER` is empty.
- `Detail.attachView` passes the payload through `Spec.detailPayload`.
- v201, v300 and v330 Specs got `ROW_ENTITIES = ""` and identity `rowPayload`/`detailPayload`, so their behavior is unchanged.
