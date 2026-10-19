package revival;

import android.view.View;
import org.json.JSONObject;

public final class Spec {
    public static final int PORT = 17201;
    public static final String ERA = "2011";
    public static final String YEAR = "2011";
    public static final String DEFAULT_SERVER = BuildConfig.DEFAULT_SERVER;
    public static final String MENU_ANCHOR = "navbar";
    public static final int MENU_COLOR = 0xffe8e8e8;
    public static final String[] MENU_LEFT_OF = {"title_sep_2", "title_button_2", "title_sep_3", "title_button_3"};
    public static final String MENU_SEPARATOR = "title_sep_3";
    public static final String MENU_STYLE_FROM = "title_button_3";
    public static final String DETAIL_ANCHOR = "image_preview";
    public static final boolean DETAIL_HIDE_ANCHOR = true;
    public static final String ROW_PROVIDER = "e";
    public static final String ROW_TEXT_SIZE = "m";
    public static final String ROW_SMALL_SIZE = "p";
    public static final String ROW_ENTITIES = "";

    private Spec() {}

    public static int rowTextBottom(View row) {
        return row.getPaddingTop() + Reflect.layoutHeight(row, "f") + Reflect.layoutHeight(row, "g") + Reflect.layoutHeight(row, "I") + Reflect.layoutHeight(row, "i");
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
