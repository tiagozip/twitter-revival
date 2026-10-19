package revival;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;
import java.lang.reflect.Field;
import org.json.JSONObject;

public final class Detail {
    private static final String TAG = "revival_extras";

    private Detail() {}

    private static final ThreadLocal<Object> STASHED = new ThreadLocal<>();

    public static void stash(Object entities) {
        STASHED.set(entities);
    }

    public static void unstash(Object result) {
        Object entities = STASHED.get();
        STASHED.remove();
        if (entities == null || result == null) return;
        for (Field field : result.getClass().getDeclaredFields()) {
            if (!field.getType().isInstance(entities)) continue;
            try {
                field.setAccessible(true);
                field.set(result, entities);
            } catch (Throwable ignored) {
            }
            return;
        }
    }

    public static void attach(Activity activity, Object entities) {
        attachView(activity.getWindow().getDecorView(), entities);
    }

    public static void attachView(View root, Object entities) {
        try {
            JSONObject pay = Spec.detailPayload(root, Extras.payloadFromEntities(entities));
            Context context = root.getContext();
            int previewId = context.getResources().getIdentifier(Spec.DETAIL_ANCHOR, "id", context.getPackageName());
            View preview = root.findViewById(previewId);
            if (preview == null || !(preview.getParent() instanceof ViewGroup)) return;
            ViewGroup parent = (ViewGroup) preview.getParent();
            ExtrasView view = (ExtrasView) parent.findViewWithTag(TAG);
            if (pay == null) {
                if (view != null) view.setVisibility(View.GONE);
                return;
            }
            if (Spec.DETAIL_HIDE_ANCHOR) preview.setVisibility(View.GONE);
            if (view == null) {
                view = new ExtrasView(context);
                view.setTag(TAG);
                view.setId(View.generateViewId());
                int top = Math.round(8 * context.getResources().getDisplayMetrics().density);
                if (parent instanceof RelativeLayout) {
                    RelativeLayout.LayoutParams params = new RelativeLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                    RelativeLayout.LayoutParams pp = (RelativeLayout.LayoutParams) preview.getLayoutParams();
                    int above = pp.getRules()[RelativeLayout.BELOW];
                    if (above != 0) params.addRule(RelativeLayout.BELOW, above);
                    params.leftMargin = pp.leftMargin;
                    params.rightMargin = pp.rightMargin;
                    params.topMargin = top;
                    for (int i = 0; i < parent.getChildCount(); i++) {
                        View child = parent.getChildAt(i);
                        if (!(child.getLayoutParams() instanceof RelativeLayout.LayoutParams)) continue;
                        RelativeLayout.LayoutParams cp = (RelativeLayout.LayoutParams) child.getLayoutParams();
                        if (cp.getRules()[RelativeLayout.BELOW] == preview.getId()) cp.addRule(RelativeLayout.BELOW, view.getId());
                    }
                    parent.addView(view, params);
                } else {
                    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                    params.topMargin = top;
                    parent.addView(view, parent.indexOfChild(preview) + 1, params);
                }
            }
            view.setVisibility(View.VISIBLE);
            view.setPayload(pay);
        } catch (Throwable ignored) {
        }
    }

    public static final class ExtrasView extends View {
        private JSONObject pay;
        private Extras.Laid laid;
        private float downX;
        private float downY;

        public ExtrasView(Context context) {
            super(context);
            setClickable(true);
            Extras.watch(this);
        }

        void setPayload(JSONObject pay) {
            this.pay = pay;
            laid = null;
            requestLayout();
            invalidate();
        }

        private Extras.Laid laid(int width) {
            if (pay == null || width <= 0) return null;
            if (laid == null || laid.width != width || laid.stale()) {
                float scaled = getResources().getDisplayMetrics().scaledDensity;
                laid = Extras.layout(getContext(), pay, width, 16 * scaled, 13 * scaled);
            }
            return laid;
        }

        @Override
        protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec);
            Extras.Laid l = laid(width - getPaddingLeft() - getPaddingRight());
            setMeasuredDimension(width, l == null ? 0 : l.height + getPaddingTop() + getPaddingBottom());
        }

        @Override
        protected void onDraw(Canvas canvas) {
            Extras.Laid l = laid(getWidth() - getPaddingLeft() - getPaddingRight());
            if (l != null) l.draw(canvas, getPaddingLeft(), getPaddingTop());
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                downX = event.getX();
                downY = event.getY();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP) {
                float slop = 12 * getResources().getDisplayMetrics().density;
                if (Math.abs(event.getX() - downX) > slop || Math.abs(event.getY() - downY) > slop || laid == null) return true;
                laid.tap(getContext(), event.getX() - getPaddingLeft(), event.getY() - getPaddingTop());
                return true;
            }
            return super.onTouchEvent(event);
        }
    }
}
