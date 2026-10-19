package revival;

import android.view.View;
import org.json.JSONObject;

public final class Spec {
    public static final int PORT = 17330;
    public static final String ERA = "2012";
    public static final String YEAR = "2012";
    public static final String DEFAULT_SERVER = BuildConfig.DEFAULT_SERVER;
    public static final String MENU_ANCHOR = "navbar";
    public static final int MENU_COLOR = 0xffffffff;
    public static final String[] MENU_LEFT_OF = {"title_button_2", "title_button_3"};
    public static final String MENU_SEPARATOR = "";
    public static final String MENU_STYLE_FROM = "title_button_3";
    public static final String DETAIL_ANCHOR = "content";
    public static final boolean DETAIL_HIDE_ANCHOR = false;
    public static final String ROW_PROVIDER = "e";
    public static final String ROW_TEXT_SIZE = "m";
    public static final String ROW_SMALL_SIZE = "p";
    public static final String ROW_ENTITIES = "";

    private Spec() {}

    public static int rowTextBottom(View row) {
        int bottom = row.getPaddingTop() + Reflect.layoutHeight(row, "g") + Reflect.layoutHeight(row, "h");
        if (Reflect.get(row, "O") != null) bottom += (int) Reflect.number(row, "L", 0) + Reflect.layoutHeight(row, "O");
        return bottom;
    }

    public static int rowContentLeft(View row) {
        return row.getPaddingLeft() * 2 + Reflect.staticDrawableWidth(row.getClass(), "c");
    }

    public static JSONObject rowPayload(View row, Object tweet, JSONObject pay) {
        return pay;
    }

    public static JSONObject detailPayload(View root, JSONObject pay) {
        return pay;
    }
}
