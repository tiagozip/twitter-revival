package revival;

import android.graphics.Canvas;
import android.view.View;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.WeakHashMap;
import org.json.JSONObject;

public final class InlineMedia {
    private static final Map<View, Slot> SLOTS = new WeakHashMap<>();
    private static Field provider;
    private static final Map<Class<?>, Method> ENTITIES = new java.util.HashMap<>();

    private InlineMedia() {}

    private static final class Slot {
        final JSONObject pay;
        Extras.Laid laid;

        Slot(JSONObject pay) {
            this.pay = pay;
        }
    }

    public static void bind(View view, Object tweet) {
        JSONObject pay = null;
        try {
            pay = Spec.rowPayload(view, tweet, findPayload(view, tweet));
        } catch (Throwable ignored) {
        }
        if (pay == null) {
            SLOTS.remove(view);
            return;
        }
        Slot old = SLOTS.get(view);
        if (old == null || old.pay != pay) SLOTS.put(view, new Slot(pay));
        Extras.watch(view);
    }

    public static int extraHeight(View view) {
        Slot slot = SLOTS.get(view);
        if (slot == null) return 0;
        Extras.Laid laid = laid(view, slot, contentWidth(view, view.getMeasuredWidth()));
        if (laid == null) return 0;
        int needed = textBottom(view) + gap(view) + laid.height + view.getPaddingBottom();
        return Math.max(0, needed - view.getMeasuredHeight());
    }

    public static int space(View view, int width) {
        Slot slot = SLOTS.get(view);
        if (slot == null) return 0;
        Extras.Laid laid = laid(view, slot, width);
        return laid == null || laid.height <= 0 ? 0 : gap(view) + laid.height;
    }

    public static int drawAt(View view, Canvas canvas, int left, int top) {
        Slot slot = SLOTS.get(view);
        Extras.Laid laid = slot == null ? null : slot.laid;
        if (laid == null || laid.height <= 0) return 0;
        laid.draw(canvas, left, top + gap(view));
        return gap(view) + laid.height;
    }

    public static void draw(View view, Canvas canvas) {
        Slot slot = SLOTS.get(view);
        if (slot == null) return;
        Extras.Laid laid = laid(view, slot, contentWidth(view, view.getWidth()));
        if (laid == null) return;
        float left = view.getScrollX() + Spec.rowContentLeft(view);
        float top = view.getScrollY() + textBottom(view) + gap(view);
        laid.draw(canvas, left, top);
    }

    private static Extras.Laid laid(View view, Slot slot, int width) {
        if (width <= 0) return null;
        if (slot.laid == null || slot.laid.width != width || slot.laid.stale()) {
            float scaled = view.getResources().getDisplayMetrics().scaledDensity;
            float text = Reflect.number(view, Spec.ROW_TEXT_SIZE, 15 * scaled);
            float small = Reflect.number(view, Spec.ROW_SMALL_SIZE, 12 * scaled);
            slot.laid = Extras.layout(view.getContext(), slot.pay, width, text, small);
        }
        return slot.laid;
    }

    private static int gap(View view) {
        return Math.round(7 * view.getResources().getDisplayMetrics().density);
    }

    private static int textBottom(View view) {
        return Spec.rowTextBottom(view);
    }

    private static int contentWidth(View view, int total) {
        return total - Spec.rowContentLeft(view) - view.getPaddingRight();
    }

    private static JSONObject findPayload(View view, Object tweet) throws Exception {
        if (Spec.ROW_PROVIDER.isEmpty()) return Extras.payloadFromEntities(Reflect.get(tweet, Spec.ROW_ENTITIES));
        if (provider == null) {
            provider = view.getClass().getDeclaredField(Spec.ROW_PROVIDER);
            provider.setAccessible(true);
        }
        Object source = provider.get(view);
        if (source == null) return null;
        Method entities = ENTITIES.get(source.getClass());
        if (entities == null) {
            for (Method m : source.getClass().getMethods()) {
                if (m.getName().equals("b") && m.getParameterTypes().length == 1 && m.getParameterTypes()[0].isInstance(tweet)) {
                    entities = m;
                    break;
                }
            }
            if (entities == null) return null;
            ENTITIES.put(source.getClass(), entities);
        }
        return Extras.payloadFromEntities(entities.invoke(source, tweet));
    }
}
