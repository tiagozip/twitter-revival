package revival;

import android.graphics.Rect;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;

public final class Spec {
    public static final int PORT = 17419;
    public static final String ERA = "2014";
    public static final String YEAR = "2013";
    public static final String DEFAULT_SERVER = BuildConfig.DEFAULT_SERVER;
    public static final String MENU_ANCHOR = "";
    public static final int MENU_COLOR = 0xffffffff;
    public static final String[] MENU_LEFT_OF = {};
    public static final String MENU_SEPARATOR = "";
    public static final String MENU_STYLE_FROM = "";
    public static final String DETAIL_ANCHOR = "content";
    public static final boolean DETAIL_HIDE_ANCHOR = false;
    public static final String ROW_PROVIDER = "";
    public static final String ROW_ENTITIES = "A";
    public static final String ROW_TEXT_SIZE = "aX";
    public static final String ROW_SMALL_SIZE = "aT";

    private Spec() {}

    public static int rowTextBottom(View row) {
        Object text = Reflect.get(row, "cc");
        return text instanceof Rect ? ((Rect) text).bottom : row.getPaddingTop();
    }

    public static int rowContentLeft(View row) {
        return row.getPaddingLeft() + (int) Reflect.number(row, "M", 0) + (int) Reflect.number(row, "P", 0) + (int) Reflect.number(row, "O", 0);
    }

    public static JSONObject rowPayload(View row, Object tweet, JSONObject pay) {
        if (pay == null || isGallery(row)) return null;
        if (nativeMedia(tweet) == null) return pay;
        int mode = (int) Reflect.number(row, "bQ", 0);
        if ((mode == 1 || mode == 3) && replacesNative(pay) && Reflect.setInt(row, "bQ", 0)) return pay;
        return withoutPhotos(pay);
    }

    public static JSONObject detailPayload(View root, JSONObject pay) {
        if (pay == null) return null;
        Object tweet = Reflect.get(root, "h");
        if (nativeMedia(tweet) == null) return pay;
        if (sensitive(tweet) || !replacesNative(pay)) return withoutPhotos(pay);
        hidePreview(root);
        return pay;
    }

    public static void detailNative(View root) {
        try {
            Object tweet = Reflect.get(root, "h");
            JSONObject pay = Extras.payloadFromEntities(Reflect.get(tweet, ROW_ENTITIES));
            if (pay != null && nativeMedia(tweet) != null && !sensitive(tweet) && replacesNative(pay)) hidePreview(root);
        } catch (Throwable ignored) {
        }
    }

    private static void hidePreview(View root) {
        Object preview = Reflect.get(root, "r");
        if (preview instanceof View) ((View) preview).setVisibility(View.GONE);
    }

    private static Object nativeMedia(Object tweet) {
        return tweet == null ? null : Reflect.get(Reflect.get(tweet, "N"), "media");
    }

    private static boolean sensitive(Object tweet) {
        Object flags = Reflect.get(tweet, "H");
        return flags instanceof Integer && ((Integer) flags & 64) != 0;
    }

    private static boolean replacesNative(JSONObject pay) {
        JSONArray photos = pay.optJSONArray("p");
        return (photos != null && photos.length() > 1) || pay.optJSONObject("v") != null;
    }

    private static JSONObject withoutPhotos(JSONObject pay) {
        if (!pay.has("p")) return pay;
        try {
            JSONObject rest = new JSONObject(pay.toString());
            rest.remove("p");
            return rest.length() == 0 ? null : rest;
        } catch (Throwable t) {
            return null;
        }
    }

    private static boolean isGallery(View row) {
        try {
            return row.getId() != View.NO_ID && "tweet".equals(row.getResources().getResourceEntryName(row.getId()));
        } catch (Throwable t) {
            return false;
        }
    }
}
