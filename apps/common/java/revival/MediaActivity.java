package revival;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.MediaController;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.VideoView;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MediaActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private JSONArray photos;
    private int index;
    private ImageView image;
    private ProgressBar spinner;
    private TextView counter;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        spinner = new ProgressBar(this);
        root.addView(spinner, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        JSONObject pay;
        try {
            pay = new JSONObject(getIntent().getStringExtra("payload"));
        } catch (Throwable t) {
            finish();
            return;
        }
        index = getIntent().getIntExtra("index", 0);
        JSONObject video = pay.optJSONObject("v");
        if (getIntent().getBooleanExtra("video", false) && video != null) {
            showVideo(root, video);
            return;
        }
        photos = pay.optJSONArray("p");
        if (photos == null || photos.length() == 0) {
            finish();
            return;
        }
        image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        root.addView(image, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        counter = new TextView(this);
        counter.setTextColor(0xccffffff);
        counter.setTextSize(14);
        int pad = Math.round(12 * getResources().getDisplayMetrics().density);
        counter.setPadding(pad, pad, pad, pad);
        root.addView(counter, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
        image.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (photos.length() > 1) {
                    index = (index + 1) % photos.length();
                    showPhoto();
                } else {
                    finish();
                }
            }
        });
        showPhoto();
    }

    private void showPhoto() {
        JSONObject p = photos.optJSONObject(index);
        if (p == null) return;
        counter.setText(photos.length() > 1 ? (index + 1) + " of " + photos.length() + "  ·  tap for next" : "");
        final String key = Extras.proxy(p.optString("u"), "large");
        Bitmap hit = Extras.cached(key);
        if (hit != null) {
            image.setImageBitmap(hit);
            spinner.setVisibility(View.GONE);
            return;
        }
        String small = Extras.proxy(p.optString("u"), photos.length() > 1 ? "small" : "medium");
        Bitmap preview = Extras.cached(small);
        image.setImageBitmap(preview);
        spinner.setVisibility(View.VISIBLE);
        final int wanted = index;
        Executors.newSingleThreadExecutor().execute(new Runnable() {
            @Override
            public void run() {
                Bitmap bitmap = null;
                try {
                    bitmap = Extras.fetch(key, 2048);
                } catch (Throwable ignored) {
                }
                final Bitmap done = bitmap;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (isFinishing() || wanted != index) return;
                        spinner.setVisibility(View.GONE);
                        if (done != null) image.setImageBitmap(done);
                    }
                });
            }
        });
    }

    private void showVideo(FrameLayout root, JSONObject video) {
        String src = video.optString("s", "");
        if (src.isEmpty()) {
            finish();
            return;
        }
        final boolean gif = video.optInt("g") == 1;
        VideoView player = new VideoView(this);
        root.addView(player, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        if (!gif) {
            MediaController controls = new MediaController(this);
            controls.setAnchorView(player);
            player.setMediaController(controls);
        }
        player.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
            @Override
            public void onPrepared(MediaPlayer mp) {
                spinner.setVisibility(View.GONE);
                mp.setLooping(gif);
            }
        });
        player.setOnErrorListener(new MediaPlayer.OnErrorListener() {
            @Override
            public boolean onError(MediaPlayer mp, int what, int extra) {
                finish();
                return true;
            }
        });
        player.setVideoURI(Uri.parse(src));
        player.start();
    }
}
