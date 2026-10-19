package revival;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;

public final class Server {
    private static final String PREFS = "revival_server";
    private static final String KEY = "base";
    private static java.lang.ref.WeakReference<AlertDialog> showing;

    private Server() {}

    public static String base(Context context) {
        String value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (value == null || value.isEmpty()) return Spec.DEFAULT_SERVER.isEmpty() ? null : normalize(Spec.DEFAULT_SERVER);
        return value;
    }

    static String normalize(String raw) {
        String value = raw.trim();
        if (value.isEmpty()) return null;
        if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://" + value;
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    public static void prompt(final Activity activity, final boolean cancelable) {
        AlertDialog open = showing == null ? null : showing.get();
        boolean alive = open != null && open.isShowing() && open.getOwnerActivity() != null && !open.getOwnerActivity().isDestroyed();
        if (alive || activity.isFinishing() || activity.isDestroyed()) return;
        final float d = activity.getResources().getDisplayMetrics().density;
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(18 * d);
        box.setPadding(pad, Math.round(8 * d), pad, 0);
        TextView hint = new TextView(activity);
        hint.setText("Twitter Revival talks to your own revival server, which translates today's X into the " + Spec.YEAR + " API. Enter its address, for example https://revival.example.com or 192.168.1.20:7171.");
        hint.setTextSize(14);
        box.addView(hint);
        final EditText field = new EditText(activity);
        field.setSingleLine(true);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        field.setHint("revival.example.com");
        String current = base(activity);
        if (current != null) field.setText(current);
        box.addView(field);
        final TextView status = new TextView(activity);
        status.setTextSize(13);
        status.setPadding(0, Math.round(6 * d), 0, 0);
        box.addView(status);
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle("Revival server")
                .setView(box)
                .setCancelable(cancelable)
                .setPositiveButton("Save", null)
                .setNeutralButton("Test", null);
        if (cancelable) builder.setNegativeButton("Cancel", null);
        final AlertDialog dialog = builder.create();
        showing = new java.lang.ref.WeakReference<>(dialog);
        dialog.setOnShowListener(new DialogInterface.OnShowListener() {
            @Override
            public void onShow(DialogInterface di) {
                Button save = dialog.getButton(DialogInterface.BUTTON_POSITIVE);
                Button test = dialog.getButton(DialogInterface.BUTTON_NEUTRAL);
                save.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        String value = normalize(field.getText().toString());
                        if (value == null) {
                            status.setText("Enter an address first.");
                            return;
                        }
                        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, value).apply();
                        dialog.dismiss();
                    }
                });
                test.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        final String value = normalize(field.getText().toString());
                        if (value == null) {
                            status.setText("Enter an address first.");
                            return;
                        }
                        status.setText("Checking " + value + "…");
                        final Handler main = new Handler(Looper.getMainLooper());
                        Executors.newSingleThreadExecutor().execute(new Runnable() {
                            @Override
                            public void run() {
                                String result;
                                try {
                                    HttpURLConnection conn = (HttpURLConnection) new URL(value + "/revival/health").openConnection();
                                    conn.setConnectTimeout(8000);
                                    conn.setReadTimeout(8000);
                                    int code = conn.getResponseCode();
                                    result = code == 200 ? "Connected. Save it and sign in." : "The server answered with HTTP " + code + ".";
                                    conn.disconnect();
                                } catch (Throwable t) {
                                    result = "Couldn't reach it: " + t.getMessage();
                                }
                                final String text = result;
                                main.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        status.setText(text);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        dialog.show();
    }
}
