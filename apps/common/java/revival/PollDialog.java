package revival;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public final class PollDialog {
    static final String MARK = "\ud83d\udcca Poll";
    private static final String[] DURATIONS = {"5 minutes", "30 minutes", "1 hour", "6 hours", "1 day", "3 days", "7 days"};
    private static final Pattern BLOCK = Pattern.compile("\\s*\ud83d\udcca Poll \\([^)]*\\)(\\n\u25cb [^\\n]*){2,4}\\s*$");

    private PollDialog() {}

    static boolean wanted(Activity activity) {
        return activity.getClass().getSimpleName().equals("PostActivity");
    }

    private static final String TAG = "revival_poll";

    static void attachButton(final Activity activity) {
        if (!wanted(activity)) return;
        try {
            String pkg = activity.getPackageName();
            int barId = activity.getResources().getIdentifier("post_button_bar", "id", pkg);
            int galleryId = activity.getResources().getIdentifier("gallery", "id", pkg);
            if (barId == 0 || galleryId == 0 || activity.getResources().getIdentifier("divot_gallery", "id", pkg) != 0) return;
            View found = activity.findViewById(barId);
            if (!(found instanceof LinearLayout) || found.findViewWithTag(TAG) != null) return;
            LinearLayout bar = (LinearLayout) found;
            View gallery = bar.findViewById(galleryId);
            if (!(gallery instanceof ImageButton) || gallery.getParent() != bar) return;
            ImageButton source = (ImageButton) gallery;
            Drawable icon = source.getDrawable();
            int w = icon != null && icon.getIntrinsicWidth() > 0 ? icon.getIntrinsicWidth() : Math.round(32 * activity.getResources().getDisplayMetrics().density);
            int h = icon != null && icon.getIntrinsicHeight() > 0 ? icon.getIntrinsicHeight() : w;
            ImageButton button = new ImageButton(activity);
            button.setTag(TAG);
            button.setContentDescription("Add poll");
            int[] look = measure(icon, w, h);
            button.setImageDrawable(new Bars(w, h, look[0], look[1]));
            button.setScaleType(source.getScaleType());
            Drawable bg = source.getBackground();
            button.setBackground(bg != null && bg.getConstantState() != null ? bg.getConstantState().newDrawable().mutate() : null);
            button.setPadding(source.getPaddingLeft(), source.getPaddingTop(), source.getPaddingRight(), source.getPaddingBottom());
            button.setOnClickListener(v -> show(activity));
            LinearLayout.LayoutParams copy = new LinearLayout.LayoutParams((LinearLayout.LayoutParams) source.getLayoutParams());
            bar.addView(button, bar.indexOfChild(source) + 1, copy);
        } catch (Throwable ignored) {
        }
    }

    private static int[] measure(Drawable icon, int w, int h) {
        int[] fallback = {0xff777777, Math.round(Math.min(w, h) * 0.62f)};
        if (icon == null) return fallback;
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Drawable copy = icon.getConstantState() != null ? icon.getConstantState().newDrawable().mutate() : icon;
        copy.setBounds(0, 0, w, h);
        copy.draw(new Canvas(bitmap));
        int[] pixels = new int[w * h];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h);
        bitmap.recycle();
        List<Integer> solid = new ArrayList<>();
        int top = h, bottom = -1;
        for (int i = 0; i < pixels.length; i++) {
            if ((pixels[i] >>> 24) < 200) continue;
            solid.add(pixels[i]);
            top = Math.min(top, i / w);
            bottom = Math.max(bottom, i / w);
        }
        if (solid.isEmpty()) return fallback;
        solid.sort((a, b) -> Integer.compare(luma(a), luma(b)));
        long r = 0, g = 0, b = 0;
        int n = Math.max(1, solid.size() * 2 / 5);
        for (int i = 0; i < n; i++) {
            int p = solid.get(i);
            r += (p >> 16) & 0xff;
            g += (p >> 8) & 0xff;
            b += p & 0xff;
        }
        int color = 0xff000000 | (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (b / n);
        return new int[] {color, Math.round((bottom - top + 1) * 0.86f)};
    }

    private static int luma(int p) {
        return ((p >> 16) & 0xff) * 3 + ((p >> 8) & 0xff) * 6 + (p & 0xff);
    }

    private static final class Bars extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int w;
        private final int h;
        private final int extent;

        Bars(int w, int h, int color, int extent) {
            this.w = w;
            this.h = h;
            this.extent = extent;
            paint.setColor(color);
        }

        @Override
        public void draw(Canvas canvas) {
            float size = Math.min(extent * getBounds().height() / (float) h, Math.min(getBounds().width(), getBounds().height()));
            float left = getBounds().exactCenterX() - size / 2;
            float top = getBounds().exactCenterY() - size / 2;
            float bar = size / 5;
            float[] lengths = {0.62f, 1f, 0.42f};
            for (int i = 0; i < 3; i++) {
                float y = top + i * bar * 2;
                canvas.drawRoundRect(new RectF(left, y, left + size * lengths[i], y + bar), bar / 2, bar / 2, paint);
            }
        }

        @Override
        public int getIntrinsicWidth() {
            return w;
        }

        @Override
        public int getIntrinsicHeight() {
            return h;
        }

        @Override
        public void setAlpha(int alpha) {
            paint.setAlpha(alpha);
        }

        @Override
        public void setColorFilter(ColorFilter filter) {
            paint.setColorFilter(filter);
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    static void show(final Activity activity) {
        final EditText box = composer(activity.getWindow().getDecorView(), activity.getCurrentFocus());
        if (box == null) return;
        float dp = activity.getResources().getDisplayMetrics().density;
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(20 * dp);
        form.setPadding(pad, Math.round(8 * dp), pad, 0);
        final List<EditText> fields = new ArrayList<>();
        for (int i = 1; i <= 4; i++) {
            EditText field = new EditText(activity);
            field.setHint(i <= 2 ? "Choice " + i : "Choice " + i + " (optional)");
            field.setSingleLine(true);
            field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            field.setFilters(new InputFilter[] {new InputFilter.LengthFilter(25)});
            form.addView(field, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            fields.add(field);
        }
        final Spinner length = new Spinner(activity);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(activity, android.R.layout.simple_spinner_item, DURATIONS);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        length.setAdapter(adapter);
        length.setSelection(4);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(8 * dp);
        form.addView(length, lp);
        final AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Add a poll")
                .setView(form)
                .setPositiveButton("Add poll", null)
                .setNegativeButton("Cancel", null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            StringBuilder block = new StringBuilder("\n\n" + MARK + " (" + DURATIONS[length.getSelectedItemPosition()] + ")");
            int count = 0;
            for (EditText field : fields) {
                String label = field.getText().toString().replace('\n', ' ').trim();
                if (label.isEmpty()) continue;
                block.append("\n\u25cb ").append(label);
                count++;
            }
            if (count < 2) {
                Toast.makeText(activity, "A poll needs at least two choices.", Toast.LENGTH_SHORT).show();
                return;
            }
            Editable text = box.getText();
            String kept = BLOCK.matcher(text.toString()).replaceFirst("");
            box.setText(kept);
            box.append(block);
            box.setSelection(Math.min(kept.length(), box.length()));
            box.requestFocus();
            dialog.dismiss();
        }));
        dialog.show();
    }

    private static EditText composer(View root, View focused) {
        if (focused instanceof EditText) return (EditText) focused;
        if (root instanceof EditText && root.isShown()) return (EditText) root;
        if (!(root instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) root;
        for (int i = 0; i < group.getChildCount(); i++) {
            EditText found = composer(group.getChildAt(i), null);
            if (found != null) return found;
        }
        return null;
    }
}
