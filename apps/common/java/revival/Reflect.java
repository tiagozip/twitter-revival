package revival;

import android.graphics.drawable.Drawable;
import android.text.Layout;
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

public final class Reflect {
    private static final Map<String, Field> FIELDS = new HashMap<>();

    private Reflect() {}

    private static Field field(Class<?> type, String name) throws NoSuchFieldException {
        String key = type.getName() + "#" + name;
        Field f = FIELDS.get(key);
        if (f == null) {
            for (Class<?> c = type; c != null && f == null; c = c.getSuperclass()) {
                try {
                    f = c.getDeclaredField(name);
                } catch (NoSuchFieldException ignored) {
                }
            }
            if (f == null) throw new NoSuchFieldException(name);
            f.setAccessible(true);
            FIELDS.put(key, f);
        }
        return f;
    }

    public static Object get(Object target, String name) {
        try {
            return field(target.getClass(), name).get(target);
        } catch (Throwable t) {
            return null;
        }
    }

    public static Object getStatic(Class<?> type, String name) {
        try {
            return field(type, name).get(null);
        } catch (Throwable t) {
            return null;
        }
    }

    public static boolean setInt(Object target, String name, int value) {
        try {
            field(target.getClass(), name).setInt(target, value);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    public static int layoutHeight(Object target, String name) {
        Object value = get(target, name);
        if (value instanceof Layout) return ((Layout) value).getHeight();
        if (value instanceof Drawable) return ((Drawable) value).getBounds().height();
        return 0;
    }

    public static float number(Object target, String name, float fallback) {
        Object value = get(target, name);
        if (value instanceof Number && ((Number) value).floatValue() > 0) return ((Number) value).floatValue();
        return fallback;
    }

    public static int staticDrawableWidth(Class<?> type, String name) {
        Object value = getStatic(type, name);
        return value instanceof Drawable ? ((Drawable) value).getIntrinsicWidth() : 0;
    }
}
