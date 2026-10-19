package revival;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableStringBuilder;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.style.AbsoluteSizeSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.util.Base64;
import android.util.LruCache;
import android.view.View;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public final class Extras {
    public static final String BASE = "http://127.0.0.1:" + Spec.PORT;
    public static final String PAYLOAD = BASE + "/m/";

    static final int BORDER = 0xffc9c9c9;
    static final int MUTED = 0xff8a8a8a;
    static final int INK = 0xff222222;
    static final int WELL = 0xffececec;
    static final int ACCENT = 0xff0084b4;

    static int version;
    private static final Map<String, Integer> VOTING = new java.util.HashMap<>();
    private static final Map<String, JSONObject> INFO = new java.util.HashMap<>();

    private static final Map<String, JSONObject> PARSED = new LinkedHashMap<String, JSONObject>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, JSONObject> eldest) {
            return size() > 300;
        }
    };
    private static final Set<String> LOADING = new HashSet<>();
    private static final List<WeakReference<View>> WATCHERS = new ArrayList<>();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(4);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Paint BITMAP = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private static final Paint FILL = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint STROKE = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(48 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
            return value.getByteCount();
        }
    };

    static {
        STROKE.setStyle(Paint.Style.STROKE);
    }

    private Extras() {}

    public static final class Target {
        public final RectF rect;
        public final Intent intent;
        public final Runnable action;

        Target(RectF rect, Intent intent) {
            this(rect, intent, null);
        }

        Target(RectF rect, Intent intent, Runnable action) {
            this.rect = rect;
            this.intent = intent;
            this.action = action;
        }
    }

    public static final class Laid {
        public final List<Block> blocks = new ArrayList<>();
        public int height;
        public int width;
        public final int version = Extras.version;
        final float gap;

        Laid(float gap) {
            this.gap = gap;
        }

        public boolean stale() {
            return version != Extras.version;
        }

        public boolean tap(Context context, float x, float y) {
            float top = 0;
            for (Block block : blocks) {
                if (y >= top && y <= top + block.height) {
                    List<Target> targets = new ArrayList<>();
                    block.targets(context, 0, top, width, targets);
                    for (Target t : targets) {
                        if (!t.rect.contains(x, y)) continue;
                        if (t.action != null) {
                            t.action.run();
                            return true;
                        }
                        if (t.intent == null) return false;
                        try {
                            context.startActivity(t.intent);
                        } catch (android.content.ActivityNotFoundException ignored) {
                        }
                        return true;
                    }
                    return false;
                }
                top += block.height + gap;
            }
            return false;
        }

        public void draw(Canvas canvas, float left, float top) {
            for (Block block : blocks) {
                block.draw(canvas, left, top, width);
                top += block.height + gap;
            }
        }
    }

    public abstract static class Block {
        int height;
        final float d;

        Block(float d) {
            this.d = d;
        }

        abstract void draw(Canvas canvas, float left, float top, int width);

        void targets(Context context, float left, float top, int width, List<Target> out) {}
    }

    public static JSONObject payloadFor(String url) {
        if (url == null || !url.startsWith(PAYLOAD)) return null;
        synchronized (PARSED) {
            JSONObject hit = PARSED.get(url);
            if (hit != null) return hit;
        }
        try {
            String token = url.substring(PAYLOAD.length());
            int q = token.indexOf('?');
            if (q >= 0) token = token.substring(0, q);
            JSONObject pay = new JSONObject(new String(Base64.decode(token, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), "UTF-8"));
            synchronized (PARSED) {
                PARSED.put(url, pay);
            }
            return pay;
        } catch (Throwable t) {
            return null;
        }
    }

    public static JSONObject payloadFromEntities(Object ay) {
        if (ay == null) return null;
        try {
            for (java.lang.reflect.Field listField : ay.getClass().getFields()) {
                Object list = listField.get(ay);
                if (!(list instanceof java.util.List)) continue;
                for (Object entity : (java.util.List<?>) list) {
                    if (entity == null) continue;
                    for (java.lang.reflect.Field f : entity.getClass().getFields()) {
                        if (f.getType() != String.class) continue;
                        JSONObject pay = payloadFor((String) f.get(entity));
                        if (pay != null) return pay;
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    public static Laid layout(Context context, JSONObject pay, int width, float textSize, float smallSize) {
        float d = context.getResources().getDisplayMetrics().density;
        Laid laid = new Laid(Math.round(7 * d));
        laid.width = width;
        JSONArray photos = pay.optJSONArray("p");
        if (photos != null && photos.length() > 0) laid.blocks.add(new Photos(photos, width, d));
        JSONObject video = pay.optJSONObject("v");
        if (video != null) laid.blocks.add(new Video(video, width, d, smallSize));
        JSONObject card = pay.optJSONObject("k");
        if (card != null) laid.blocks.add(new Card(card, width, d, textSize, smallSize));
        JSONObject poll = pay.optJSONObject("o");
        if (poll != null) laid.blocks.add(new Poll(poll, width, d, textSize, smallSize));
        JSONObject space = pay.optJSONObject("s");
        if (space != null) laid.blocks.add(new Space(space, width, d, textSize, smallSize));
        JSONObject community = pay.optJSONObject("y");
        if (community != null) laid.blocks.add(new Community(community, width, d, smallSize));
        JSONObject quote = pay.optJSONObject("q");
        if (quote != null) laid.blocks.add(new Quote(quote, width, d, textSize, smallSize));
        JSONObject note = pay.optJSONObject("n");
        if (note != null) laid.blocks.add(new Note(note, width, d, textSize, smallSize));
        int total = 0;
        for (int i = 0; i < laid.blocks.size(); i++) total += laid.blocks.get(i).height + (i > 0 ? laid.gap : 0);
        laid.height = total;
        return laid;
    }

    public static void watch(View view) {
        synchronized (WATCHERS) {
            for (WeakReference<View> ref : WATCHERS) {
                if (ref.get() == view) return;
            }
            WATCHERS.add(new WeakReference<>(view));
        }
    }

    static StaticLayout text(CharSequence value, int width, float size, int color, boolean bold, int maxLines) {
        TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(size);
        paint.setColor(color);
        paint.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return StaticLayout.Builder.obtain(value, 0, value.length(), paint, Math.max(1, width))
                .setMaxLines(maxLines)
                .setEllipsize(TextUtils.TruncateAt.END)
                .setLineSpacing(0, 1.05f)
                .build();
    }

    static void drawText(Canvas canvas, StaticLayout layout, float x, float y) {
        canvas.save();
        canvas.translate(x, y);
        layout.draw(canvas);
        canvas.restore();
    }

    static float ratio(JSONObject img, float min, float max, float fallback) {
        double w = img == null ? 0 : img.optDouble("w", 0);
        double h = img == null ? 0 : img.optDouble("h", 0);
        if (w <= 0 || h <= 0) return fallback;
        return (float) Math.max(min, Math.min(max, h / w));
    }

    static void frame(Canvas canvas, RectF box, float d, int border) {
        STROKE.setColor(border);
        STROKE.setStrokeWidth(Math.max(1f, d * 0.6f));
        canvas.drawRoundRect(box, 5 * d, 5 * d, STROKE);
    }

    static void image(Canvas canvas, String url, String size, RectF box, float radius) {
        String key = proxy(url, size);
        Bitmap bitmap = CACHE.get(key);
        canvas.save();
        Path clip = new Path();
        clip.addRoundRect(box, radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);
        if (bitmap == null) {
            FILL.setColor(WELL);
            canvas.drawRect(box, FILL);
            load(key);
        } else {
            canvas.drawBitmap(bitmap, crop(bitmap, box), box, BITMAP);
        }
        canvas.restore();
    }

    static Rect crop(Bitmap bitmap, RectF box) {
        float target = box.height() / box.width();
        int bw = bitmap.getWidth();
        int bh = bitmap.getHeight();
        if ((float) bh / bw > target) {
            int h = Math.round(bw * target);
            int y = Math.max(0, (bh - h) / 3);
            return new Rect(0, y, bw, y + h);
        }
        int w = Math.round(bh / target);
        int x = (bw - w) / 2;
        return new Rect(x, 0, x + w, bh);
    }

    public static String proxy(String url, String size) {
        try {
            return BASE + "/img?u=" + URLEncoder.encode(url, "UTF-8") + (size == null ? "" : "&size=" + size);
        } catch (Throwable t) {
            return url;
        }
    }

    public static Bitmap cached(String key) {
        return CACHE.get(key);
    }

    static Intent viewer(Context context, JSONObject pay, int index, boolean video) {
        Intent intent = new Intent(context, MediaActivity.class);
        intent.putExtra("payload", pay.toString());
        intent.putExtra("index", index);
        intent.putExtra("video", video);
        return intent;
    }

    static final class Photos extends Block {
        final JSONArray photos;

        Photos(JSONArray photos, int width, float d) {
            super(d);
            this.photos = photos;
            int n = photos.length();
            height = n == 1 ? Math.round(width * ratio(photos.optJSONObject(0), 0.4f, 0.8f, 0.5625f)) : Math.round(width * (n == 2 ? 0.56f : 0.62f));
        }

        RectF[] cells(float left, float top, int width) {
            int n = Math.min(4, photos.length());
            float g = 2 * d;
            float half = (width - g) / 2f;
            float halfH = (height - g) / 2f;
            if (n == 1) return new RectF[] {new RectF(left, top, left + width, top + height)};
            if (n == 2) return new RectF[] {new RectF(left, top, left + half, top + height), new RectF(left + half + g, top, left + width, top + height)};
            if (n == 3) return new RectF[] {new RectF(left, top, left + half, top + height), new RectF(left + half + g, top, left + width, top + halfH), new RectF(left + half + g, top + halfH + g, left + width, top + height)};
            return new RectF[] {new RectF(left, top, left + half, top + halfH), new RectF(left + half + g, top, left + width, top + halfH), new RectF(left, top + halfH + g, left + half, top + height), new RectF(left + half + g, top + halfH + g, left + width, top + height)};
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF[] cells = cells(left, top, width);
            for (int i = 0; i < cells.length; i++) {
                JSONObject p = photos.optJSONObject(i);
                if (p == null) continue;
                image(canvas, p.optString("u"), cells.length == 1 ? "medium" : "small", cells[i], 5 * d);
                frame(canvas, cells[i], d, BORDER);
            }
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            RectF[] cells = cells(left, top, width);
            JSONObject pay = new JSONObject();
            try {
                pay.put("p", photos);
            } catch (Throwable ignored) {
            }
            for (int i = 0; i < cells.length; i++) out.add(new Target(cells[i], viewer(context, pay, i, false)));
        }
    }

    static final class Video extends Block {
        final JSONObject video;
        final StaticLayout label;

        Video(JSONObject video, int width, float d, float small) {
            super(d);
            this.video = video;
            height = Math.round(width * ratio(video, 0.4f, 0.8f, 0.5625f));
            String text;
            if (video.optInt("g") == 1) {
                text = "GIF";
            } else {
                long s = video.optLong("d") / 1000;
                text = String.format(Locale.US, "%d:%02d", s / 60, s % 60);
            }
            label = text(text, width, small, 0xffffffff, true, 1);
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF box = new RectF(left, top, left + width, top + height);
            image(canvas, video.optString("t"), "medium", box, 5 * d);
            frame(canvas, box, d, BORDER);
            float cx = box.centerX();
            float cy = box.centerY();
            float radius = 24 * d;
            FILL.setColor(0xb0000000);
            canvas.drawCircle(cx, cy, radius, FILL);
            STROKE.setColor(0xe0ffffff);
            STROKE.setStrokeWidth(2 * d);
            canvas.drawCircle(cx, cy, radius, STROKE);
            Path play = new Path();
            play.moveTo(cx - 7 * d, cy - 11 * d);
            play.lineTo(cx + 12 * d, cy);
            play.lineTo(cx - 7 * d, cy + 11 * d);
            play.close();
            FILL.setColor(0xffffffff);
            canvas.drawPath(play, FILL);
            float pad = 5 * d;
            float lw = label.getLineWidth(0);
            RectF pill = new RectF(left + 8 * d, box.bottom - 8 * d - label.getHeight() - pad, left + 8 * d + lw + pad * 2, box.bottom - 8 * d);
            FILL.setColor(0xb0000000);
            canvas.drawRoundRect(pill, 3 * d, 3 * d, FILL);
            drawText(canvas, label, pill.left + pad, pill.top + pad / 2);
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            JSONObject pay = new JSONObject();
            try {
                pay.put("v", video);
            } catch (Throwable ignored) {
            }
            out.add(new Target(new RectF(left, top, left + width, top + height), viewer(context, pay, 0, true)));
        }
    }

    static final class Card extends Block {
        final JSONObject card;
        final JSONObject img;
        final int imageHeight;
        final StaticLayout title;
        final StaticLayout domain;
        final float pad;

        Card(JSONObject card, int width, float d, float size, float small) {
            super(d);
            this.card = card;
            img = card.optJSONObject("i");
            pad = 9 * d;
            imageHeight = img == null ? 0 : Math.round(width * 0.5f);
            int inner = Math.round(width - pad * 2);
            title = text(card.optString("t"), inner, size, INK, true, 2);
            domain = text(card.optString("d"), inner, small, MUTED, false, 1);
            height = Math.round(imageHeight + pad * 2 + title.getHeight() + domain.getHeight() + 2 * d);
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF box = new RectF(left, top, left + width, top + height);
            FILL.setColor(0xfff7f7f7);
            canvas.drawRoundRect(box, 5 * d, 5 * d, FILL);
            if (img != null) {
                RectF photo = new RectF(left, top, left + width, top + imageHeight);
                canvas.save();
                canvas.clipRect(photo);
                image(canvas, img.optString("u"), "small", new RectF(photo.left, photo.top, photo.right, photo.bottom + 6 * d), 5 * d);
                canvas.restore();
            }
            float y = top + imageHeight + pad;
            drawText(canvas, title, left + pad, y);
            drawText(canvas, domain, left + pad, y + title.getHeight() + 2 * d);
            frame(canvas, box, d, BORDER);
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            String url = card.optString("u", "");
            if (url.isEmpty()) return;
            out.add(new Target(new RectF(left, top, left + width, top + height), new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }
    }

    static final class Poll extends Block {
        final JSONObject poll;
        final List<StaticLayout> labels = new ArrayList<>();
        final List<StaticLayout> buttons = new ArrayList<>();
        final List<StaticLayout> percents = new ArrayList<>();
        final List<Float> shares = new ArrayList<>();
        final StaticLayout footer;
        final StaticLayout sending;
        final float row;
        final boolean open;
        final int chosen;
        int winner = -1;

        Poll(JSONObject poll, int width, float d, float size, float small) {
            super(d);
            this.poll = poll;
            JSONArray choices = poll.optJSONArray("c");
            long total = 0;
            int n = choices == null ? 0 : choices.length();
            long best = 0;
            for (int i = 0; i < n; i++) {
                long c = choices.optJSONObject(i).optLong("n");
                total += c;
                if (c > best) {
                    best = c;
                    winner = i;
                }
            }
            long ends = poll.optLong("e");
            boolean over = poll.optInt("f") == 1 || (ends > 0 && ends < System.currentTimeMillis());
            chosen = poll.optInt("s");
            open = !over && chosen == 0 && !poll.optString("i").isEmpty() && poll.optString("u").startsWith("card://");
            row = 30 * d;
            int labelWidth = Math.round(width * 0.72f);
            for (int i = 0; i < n; i++) {
                JSONObject c = choices.optJSONObject(i);
                float share = total == 0 ? 0 : (float) c.optLong("n") / total;
                boolean strong = i == winner || i + 1 == chosen;
                shares.add(share);
                labels.add(text(c.optString("l"), labelWidth, size, INK, strong, 1));
                buttons.add(text(c.optString("l"), Math.round(width - 18 * d), size, ACCENT, true, 1));
                percents.add(text(Math.round(share * 100) + "%", width, size, INK, strong, 1));
            }
            String status;
            if (over) {
                status = "Final results";
            } else if (ends > 0) {
                long mins = Math.max(1, (ends - System.currentTimeMillis()) / 60000);
                long count = mins >= 1440 ? mins / 1440 : mins >= 60 ? mins / 60 : mins;
                String unit = mins >= 1440 ? "day" : mins >= 60 ? "hour" : "minute";
                status = count + " " + unit + (count == 1 ? "" : "s") + " left";
            } else {
                status = "";
            }
            footer = text(String.format(Locale.US, total == 1 ? "%,d vote%s" : "%,d votes%s", total, status.isEmpty() ? "" : " · " + status), width, small, MUTED, false, 1);
            sending = text("Sending your vote…", width, small, MUTED, false, 1);
            height = Math.round(n * (row + 5 * d) + footer.getHeight());
        }

        RectF rowBox(float left, float top, int width, int i) {
            float y = top + i * (row + 5 * d);
            return new RectF(left, y, left + width, y + row);
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            Integer pending;
            synchronized (VOTING) {
                pending = VOTING.get(poll.optString("i"));
            }
            float stroke = Math.max(1f, d * 0.6f);
            for (int i = 0; i < labels.size(); i++) {
                RectF track = rowBox(left, top, width, i);
                if (open) {
                    boolean picked = pending != null && pending == i + 1;
                    FILL.setColor(picked ? 0xffd6ecf7 : 0xffffffff);
                    canvas.drawRoundRect(track, 4 * d, 4 * d, FILL);
                    STROKE.setColor(pending == null || picked ? ACCENT : 0xffb8d9e8);
                    STROKE.setStrokeWidth(Math.max(1f, d));
                    canvas.drawRoundRect(track, 4 * d, 4 * d, STROKE);
                    StaticLayout b = buttons.get(i);
                    drawText(canvas, b, track.centerX() - b.getLineWidth(0) / 2, track.top + (row - b.getHeight()) / 2);
                    continue;
                }
                FILL.setColor(0xfff1f1f1);
                canvas.drawRoundRect(track, 4 * d, 4 * d, FILL);
                float share = shares.get(i);
                if (share > 0) {
                    RectF fill = new RectF(left, track.top, left + Math.max(8 * d, width * share), track.bottom);
                    FILL.setColor(i == winner ? 0xff9ccdf0 : 0xffcfe4f5);
                    canvas.drawRoundRect(fill, 4 * d, 4 * d, FILL);
                }
                STROKE.setColor(0xffdddddd);
                STROKE.setStrokeWidth(stroke);
                canvas.drawRoundRect(track, 4 * d, 4 * d, STROKE);
                StaticLayout label = labels.get(i);
                StaticLayout pct = percents.get(i);
                float ly = track.top + (row - label.getHeight()) / 2;
                drawText(canvas, label, left + 9 * d, ly);
                if (i + 1 == chosen) {
                    float cx = left + 9 * d + label.getLineWidth(0) + 7 * d;
                    float cy = track.centerY();
                    Path check = new Path();
                    check.moveTo(cx, cy);
                    check.lineTo(cx + 3.5f * d, cy + 3.5f * d);
                    check.lineTo(cx + 10 * d, cy - 4 * d);
                    STROKE.setColor(ACCENT);
                    STROKE.setStrokeWidth(2 * d);
                    STROKE.setStrokeCap(Paint.Cap.ROUND);
                    STROKE.setStrokeJoin(Paint.Join.ROUND);
                    canvas.drawPath(check, STROKE);
                    STROKE.setStrokeCap(Paint.Cap.BUTT);
                    STROKE.setStrokeJoin(Paint.Join.MITER);
                }
                drawText(canvas, pct, left + width - 9 * d - pct.getLineWidth(0), track.top + (row - pct.getHeight()) / 2);
            }
            drawText(canvas, pending != null ? sending : footer, left, top + labels.size() * (row + 5 * d));
        }

        @Override
        void targets(final Context context, float left, float top, int width, List<Target> out) {
            if (!open) return;
            for (int i = 0; i < labels.size(); i++) {
                final int choice = i + 1;
                out.add(new Target(rowBox(left, top, width, i), null, new Runnable() {
                    @Override
                    public void run() {
                        vote(context, poll, choice);
                    }
                }));
            }
        }
    }

    static void vote(final Context context, final JSONObject poll, final int choice) {
        final String id = poll.optString("i");
        synchronized (VOTING) {
            if (VOTING.containsKey(id)) return;
            VOTING.put(id, choice);
        }
        refresh();
        POOL.execute(new Runnable() {
            @Override
            public void run() {
                JSONObject result = null;
                try {
                    String body = "tweet_id=" + URLEncoder.encode(id, "UTF-8")
                            + "&card_uri=" + URLEncoder.encode(poll.optString("u"), "UTF-8")
                            + "&card_name=" + URLEncoder.encode(poll.optString("k"), "UTF-8")
                            + "&choice=" + choice
                            + "&t=" + URLEncoder.encode(poll.optString("t"), "UTF-8");
                    HttpURLConnection conn = (HttpURLConnection) new URL(BASE + "/revival/vote").openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    try (java.io.OutputStream os = conn.getOutputStream()) {
                        os.write(body.getBytes("UTF-8"));
                    }
                    if (conn.getResponseCode() == 200) {
                        try (InputStream in = conn.getInputStream()) {
                            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                            byte[] chunk = new byte[4096];
                            for (int n = in.read(chunk); n != -1; n = in.read(chunk)) buffer.write(chunk, 0, n);
                            result = new JSONObject(buffer.toString("UTF-8"));
                        }
                    }
                    conn.disconnect();
                } catch (Throwable ignored) {
                }
                final JSONObject done = result;
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        synchronized (VOTING) {
                            VOTING.remove(id);
                        }
                        if (done != null && done.optJSONArray("c") != null) {
                            try {
                                poll.put("c", done.getJSONArray("c"));
                                poll.put("s", done.optInt("s", choice));
                                poll.put("f", done.optInt("f"));
                                if (done.optLong("e") > 0) poll.put("e", done.optLong("e"));
                            } catch (Throwable ignored) {
                            }
                        } else {
                            android.widget.Toast.makeText(context, "Couldn't send your vote. Try again.", android.widget.Toast.LENGTH_SHORT).show();
                        }
                        refresh();
                    }
                });
            }
        });
    }

    private static final WeakHashMap<View, long[]> RETRIES = new WeakHashMap<>();

    public static void retry(final Object target, final Object client) {
        if (!(target instanceof View) || client == null) return;
        View view = (View) target;
        long now = android.os.SystemClock.uptimeMillis();
        long[] state = RETRIES.get(view);
        if (state == null || now - state[0] > 20000) {
            state = new long[] {now, 0};
            RETRIES.put(view, state);
        }
        if (state[1]++ >= 12) return;
        Method bind = null;
        for (Method m : target.getClass().getMethods()) {
            Class<?>[] params = m.getParameterTypes();
            if (m.getName().equals("a") && m.getReturnType() == void.class && params.length == 1 && params[0].isInstance(client)) bind = m;
        }
        if (bind == null) return;
        final Method call = bind;
        view.postDelayed(() -> {
            try {
                call.invoke(target, client);
            } catch (Throwable ignored) {
            }
        }, 900);
    }

    static final class Space extends Block {
        final String id;
        final StaticLayout label;
        final StaticLayout title;
        final StaticLayout detail;
        final float pad;

        Space(JSONObject space, int width, float d, float size, float small) {
            super(d);
            id = space.optString("i");
            pad = 10 * d;
            int inner = Math.round(width - pad * 2);
            JSONObject info = info("space", id, space.optString("t"));
            if (info == null) {
                label = text("Space", inner, small, 0xffe6dcff, true, 1);
                title = text("Loading this Space…", inner, size, 0xffffffff, true, 2);
                detail = text("", inner, small, 0xffe6dcff, false, 1);
            } else {
                String state = info.optString("s");
                boolean live = state.equals("Running");
                long listeners = info.optLong("l");
                label = text(live ? "● Live Space" : state.equals("NotStarted") ? "Scheduled Space" : "Space ended", inner, small, 0xffe6dcff, true, 1);
                title = text(info.optString("t", "Untitled Space"), inner, size * 1.1f, 0xffffffff, true, 3);
                String host = info.optString("c").isEmpty() ? "" : "@" + info.optString("c");
                String count = live && listeners > 0 ? String.format(Locale.US, "%,d listening", listeners) : !live && info.optInt("r") == 1 ? "Recording available" : "";
                detail = text(host + (host.isEmpty() || count.isEmpty() ? "" : " · ") + count, inner, small, 0xffe6dcff, false, 1);
            }
            height = Math.round(pad * 2 + label.getHeight() + 4 * d + title.getHeight() + (detail.getHeight() > 0 ? 4 * d + detail.getHeight() : 0));
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF box = new RectF(left, top, left + width, top + height);
            FILL.setColor(0xff7856ff);
            canvas.drawRoundRect(box, 7 * d, 7 * d, FILL);
            float y = top + pad;
            drawText(canvas, label, left + pad, y);
            y += label.getHeight() + 4 * d;
            drawText(canvas, title, left + pad, y);
            y += title.getHeight() + 4 * d;
            drawText(canvas, detail, left + pad, y);
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            if (id.isEmpty()) return;
            out.add(new Target(new RectF(left, top, left + width, top + height), new Intent(Intent.ACTION_VIEW, Uri.parse("https://x.com/i/spaces/" + id))));
        }
    }

    static final class Community extends Block {
        final String id;
        final StaticLayout line;

        Community(JSONObject community, int width, float d, float small) {
            super(d);
            id = community.optString("i");
            JSONObject info = info("community", id, community.optString("t"));
            String name = info == null ? "a community" : info.optString("n", "a community");
            String members = info == null || info.optLong("m") <= 0 ? "" : String.format(Locale.US, " \u00b7 %,d members", info.optLong("m"));
            line = text("Posted in " + name + members, width, small, MUTED, false, 1);
            height = line.getHeight();
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            drawText(canvas, line, left, top);
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            if (id.isEmpty()) return;
            out.add(new Target(new RectF(left, top, left + width, top + height), new Intent(Intent.ACTION_VIEW, Uri.parse("https://x.com/i/communities/" + id))));
        }
    }

    static JSONObject info(final String kind, final String id, final String token) {
        if (id.isEmpty()) return null;
        final String key = kind + ":" + id;
        synchronized (INFO) {
            JSONObject hit = INFO.get(key);
            if (hit != null) return hit;
        }
        synchronized (LOADING) {
            if (!LOADING.add(key)) return null;
        }
        POOL.execute(() -> {
            JSONObject found = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(BASE + "/revival/" + kind + "/" + URLEncoder.encode(id, "UTF-8") + "?t=" + URLEncoder.encode(token, "UTF-8")).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                if (conn.getResponseCode() == 200) {
                    try (InputStream in = conn.getInputStream()) {
                        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                        byte[] chunk = new byte[4096];
                        for (int n = in.read(chunk); n != -1; n = in.read(chunk)) buffer.write(chunk, 0, n);
                        found = new JSONObject(buffer.toString("UTF-8"));
                    }
                }
                conn.disconnect();
            } catch (Throwable ignored) {
            }
            final JSONObject done = found;
            MAIN.post(() -> {
                if (done != null) {
                    synchronized (INFO) {
                        INFO.put(key, done);
                    }
                    refresh();
                }
                MAIN.postDelayed(() -> {
                    synchronized (LOADING) {
                        LOADING.remove(key);
                    }
                }, done == null ? 15000 : 0);
            });
        });
        return null;
    }

    static void refresh() {
        version++;
        synchronized (WATCHERS) {
            for (int i = WATCHERS.size() - 1; i >= 0; i--) {
                View view = WATCHERS.get(i).get();
                if (view == null) {
                    WATCHERS.remove(i);
                } else if (view.isAttachedToWindow()) {
                    view.requestLayout();
                    view.invalidate();
                }
            }
        }
    }

    static final class Quote extends Block {
        final JSONObject quote;
        final JSONObject img;
        final StaticLayout name;
        final StaticLayout body;
        final int imageHeight;
        final float pad;
        final float face;

        Quote(JSONObject quote, int width, float d, float size, float small) {
            super(d);
            this.quote = quote;
            img = quote.optJSONObject("p");
            pad = 9 * d;
            face = 22 * d;
            int inner = Math.round(width - pad * 2);
            String display = quote.optString("n");
            String handle = "@" + quote.optString("s");
            SpannableStringBuilder header = new SpannableStringBuilder(display).append("  ").append(handle);
            header.setSpan(new StyleSpan(Typeface.BOLD), 0, display.length(), 0);
            header.setSpan(new ForegroundColorSpan(MUTED), display.length() + 2, header.length(), 0);
            header.setSpan(new AbsoluteSizeSpan(Math.round(small)), display.length() + 2, header.length(), 0);
            name = text(header, Math.round(inner - face - 6 * d), size * 0.93f, INK, false, 1);
            String t = quote.optString("t");
            body = t.isEmpty() ? null : text(t, inner, size * 0.93f, INK, false, 8);
            imageHeight = img == null ? 0 : Math.round(inner * ratio(img, 0.35f, 0.6f, 0.5f));
            float h = pad + Math.max(face, name.getHeight()) + (body == null ? 0 : 5 * d + body.getHeight()) + (img == null ? 0 : 7 * d + imageHeight) + pad;
            height = Math.round(h);
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF box = new RectF(left, top, left + width, top + height);
            FILL.setColor(0xffffffff);
            canvas.drawRoundRect(box, 5 * d, 5 * d, FILL);
            frame(canvas, box, d, BORDER);
            float x = left + pad;
            float y = top + pad;
            String avatarUrl = quote.optString("a", "");
            RectF faceBox = new RectF(x, y, x + face, y + face);
            if (!avatarUrl.isEmpty()) image(canvas, avatarUrl, null, faceBox, 3 * d);
            drawText(canvas, name, x + face + 6 * d, y + (face - name.getHeight()) / 2);
            y += Math.max(face, name.getHeight());
            if (body != null) {
                y += 5 * d;
                drawText(canvas, body, x, y);
                y += body.getHeight();
            }
            if (img != null) {
                y += 7 * d;
                RectF photo = new RectF(x, y, left + width - pad, y + imageHeight);
                image(canvas, img.optString("u"), "small", photo, 4 * d);
                frame(canvas, photo, d, BORDER);
            }
        }

        @Override
        void targets(Context context, float left, float top, int width, List<Target> out) {
            String id = quote.optString("i", "");
            if (id.isEmpty()) return;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("twitter://status?status_id=" + id));
            intent.setPackage(context.getPackageName());
            out.add(new Target(new RectF(left, top, left + width, top + height), intent));
        }
    }

    static final class Note extends Block {
        final StaticLayout title;
        final StaticLayout body;
        final float pad;

        Note(JSONObject note, int width, float d, float size, float small) {
            super(d);
            pad = 9 * d;
            int inner = Math.round(width - pad * 2);
            title = text("Readers added context", inner, small, 0xff6b5a14, true, 1);
            body = text(note.optString("t"), inner, size * 0.9f, INK, false, 10);
            height = Math.round(pad * 2 + title.getHeight() + 4 * d + body.getHeight());
        }

        @Override
        void draw(Canvas canvas, float left, float top, int width) {
            RectF box = new RectF(left, top, left + width, top + height);
            FILL.setColor(0xfffdf6dc);
            canvas.drawRoundRect(box, 5 * d, 5 * d, FILL);
            frame(canvas, box, d, 0xffd9c47a);
            drawText(canvas, title, left + pad, top + pad);
            drawText(canvas, body, left + pad, top + pad + title.getHeight() + 4 * d);
        }
    }

    static int intField(Object target, String name, int fallback) {
        try {
            Field f = target.getClass().getDeclaredField(name);
            f.setAccessible(true);
            int value = f.getInt(target);
            return value > 0 ? value : fallback;
        } catch (Throwable t) {
            return fallback;
        }
    }

    public static void load(final String key) {
        synchronized (LOADING) {
            if (!LOADING.add(key)) return;
        }
        POOL.execute(new Runnable() {
            @Override
            public void run() {
                Bitmap bitmap = null;
                try {
                    bitmap = fetch(key, 800);
                } catch (Throwable ignored) {
                }
                final Bitmap done = bitmap;
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        if (done == null) {
                            MAIN.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    synchronized (LOADING) {
                                        LOADING.remove(key);
                                    }
                                }
                            }, 15000);
                            return;
                        }
                        CACHE.put(key, done);
                        synchronized (LOADING) {
                            LOADING.remove(key);
                        }
                        synchronized (WATCHERS) {
                            for (int i = WATCHERS.size() - 1; i >= 0; i--) {
                                View view = WATCHERS.get(i).get();
                                if (view == null) {
                                    WATCHERS.remove(i);
                                } else if (view.isAttachedToWindow()) {
                                    view.invalidate();
                                }
                            }
                        }
                    }
                });
            }
        });
    }

    public static Bitmap fetch(String url, int maxWidth) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            for (int n = in.read(chunk); n != -1; n = in.read(chunk)) buffer.write(chunk, 0, n);
            byte[] bytes = buffer.toByteArray();
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            while (bounds.outWidth / (opts.inSampleSize * 2) >= maxWidth) opts.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        } finally {
            conn.disconnect();
        }
    }
}
