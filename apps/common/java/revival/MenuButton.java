package revival;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;

public final class MenuButton {
    private static final String TAG = "revival_menu";

    private MenuButton() {}

    private static final class Dots extends Drawable {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint shade = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float d;

        Dots(float density, int color) {
            d = density;
            fill.setColor(color);
            shade.setColor(0x66000000);
        }

        @Override
        public void draw(Canvas canvas) {
            float cx = getBounds().exactCenterX();
            float cy = getBounds().exactCenterY();
            float r = 2.6f * d;
            float gap = 7.5f * d;
            for (int i = -1; i <= 1; i++) {
                canvas.drawCircle(cx, cy + i * gap + d, r, shade);
                canvas.drawCircle(cx, cy + i * gap, r, fill);
            }
        }

        @Override
        public int getIntrinsicWidth() {
            return Math.round(24 * d);
        }

        @Override
        public int getIntrinsicHeight() {
            return Math.round(28 * d);
        }

        @Override
        public void setAlpha(int alpha) {
            fill.setAlpha(alpha);
        }

        @Override
        public void setColorFilter(ColorFilter filter) {
            fill.setColorFilter(filter);
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    private static final java.util.Map<Class<?>, Boolean> MENUS = new java.util.HashMap<>();

    private static boolean hasMenu(Activity activity, View anchor) {
        Boolean known = MENUS.get(activity.getClass());
        if (known != null) return known;
        boolean result;
        try {
            android.view.Menu menu = new android.widget.PopupMenu(activity, anchor).getMenu();
            result = activity.onCreateOptionsMenu(menu) && menu.size() > 0;
        } catch (Throwable t) {
            result = false;
        }
        MENUS.put(activity.getClass(), result);
        return result;
    }

    private static View byName(Activity activity, ViewGroup bar, String name) {
        if (name == null || name.isEmpty()) return null;
        int id = activity.getResources().getIdentifier(name, "id", activity.getPackageName());
        return id == 0 ? null : bar.findViewById(id);
    }

    public static void attach(final Activity activity) {
        try {
            int anchorId = activity.getResources().getIdentifier(Spec.MENU_ANCHOR, "id", activity.getPackageName());
            if (anchorId == 0) return;
            View found = activity.findViewById(anchorId);
            if (!(found instanceof ViewGroup)) return;
            ViewGroup bar = (ViewGroup) found;
            if (bar.findViewWithTag(TAG) != null) return;
            View styleFrom = byName(activity, bar, Spec.MENU_STYLE_FROM);
            View leftOf = null;
            java.util.List<Integer> skipped = new java.util.ArrayList<>();
            for (String name : Spec.MENU_LEFT_OF) {
                View v = byName(activity, bar, name);
                if (v == null) continue;
                if (v.getVisibility() == View.VISIBLE) {
                    leftOf = v;
                    break;
                }
                skipped.add(v.getId());
            }
            View sepSource = byName(activity, bar, Spec.MENU_SEPARATOR);
            if (leftOf == null || !(styleFrom instanceof ImageButton) || !hasMenu(activity, bar)) return;
            ImageButton neighbour = (ImageButton) styleFrom;
            float d = activity.getResources().getDisplayMetrics().density;
            ImageButton button = new ImageButton(activity);
            button.setTag(TAG);
            button.setId(View.generateViewId());
            button.setContentDescription("Menu");
            button.setImageDrawable(new Dots(d, Spec.MENU_COLOR));
            button.setScaleType(ImageView.ScaleType.CENTER);
            if (neighbour.getBackground() != null && neighbour.getBackground().getConstantState() != null) {
                button.setBackground(neighbour.getBackground().getConstantState().newDrawable().mutate());
            } else {
                button.setBackgroundColor(0);
            }
            button.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    activity.openOptionsMenu();
                }
            });
            button.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    Server.prompt(activity, true);
                    return true;
                }
            });
            int width = neighbour.getWidth() > 0 ? neighbour.getWidth() : Math.round(48 * d);
            if (bar instanceof RelativeLayout) {
                RelativeLayout.LayoutParams lp = new RelativeLayout.LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT);
                lp.addRule(RelativeLayout.LEFT_OF, leftOf.getId());
                bar.addView(button, lp);
                int pointAt = button.getId();
                if (sepSource instanceof ImageView && ((ImageView) sepSource).getDrawable() != null) {
                    ImageView source = (ImageView) sepSource;
                    ImageView sep = new ImageView(activity);
                    Drawable.ConstantState state = source.getDrawable().getConstantState();
                    sep.setImageDrawable(state != null ? state.newDrawable() : source.getDrawable());
                    sep.setScaleType(source.getScaleType());
                    sep.setId(View.generateViewId());
                    RelativeLayout.LayoutParams sl = new RelativeLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT);
                    sl.addRule(RelativeLayout.LEFT_OF, button.getId());
                    bar.addView(sep, sl);
                    pointAt = sep.getId();
                }
                skipped.add(leftOf.getId());
                for (int i = 0; i < bar.getChildCount(); i++) {
                    View child = bar.getChildAt(i);
                    if (TAG.equals(child.getTag()) || child.getId() == pointAt || !(child.getLayoutParams() instanceof RelativeLayout.LayoutParams)) continue;
                    RelativeLayout.LayoutParams cp = (RelativeLayout.LayoutParams) child.getLayoutParams();
                    if (skipped.contains(cp.getRules()[RelativeLayout.LEFT_OF]) && !skipped.contains(child.getId())) cp.addRule(RelativeLayout.LEFT_OF, pointAt);
                }
                bar.requestLayout();
                return;
            }
            if (bar instanceof LinearLayout) {
                int index = bar.indexOfChild(leftOf);
                bar.addView(button, index, new LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.MATCH_PARENT));
                if (sepSource instanceof ImageView && ((ImageView) sepSource).getDrawable() != null && ((ImageView) sepSource).getDrawable().getConstantState() != null) {
                    ImageView sep = new ImageView(activity);
                    sep.setImageDrawable(((ImageView) sepSource).getDrawable().getConstantState().newDrawable());
                    sep.setScaleType(((ImageView) sepSource).getScaleType());
                    bar.addView(sep, index, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
                }
            }
        } catch (Throwable ignored) {
        }
    }
}
