package revival;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ContentProviderOperation;
import android.content.Context;
import android.content.ContentProviderResult;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationProvider;
import android.content.res.Resources;
import android.net.Uri;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class Safe {
    private static final String CHANNEL = "revival";

    private Safe() {}

    public static String quote(Object owner, int id, Object[] args) {
        if (args != null && args.length > 1 && args[1] instanceof CharSequence && "quote_format".equals(entry(id))) {
            String text = args[1].toString().replaceAll("\\s+", " ").trim();
            if (text.codePointCount(0, text.length()) > 100) {
                args = args.clone();
                args[1] = text.substring(0, text.offsetByCodePoints(0, 100)).trim() + "\u2026";
            }
        }
        if (owner instanceof Context) return ((Context) owner).getString(id, args);
        if (owner instanceof Resources) return ((Resources) owner).getString(id, args);
        try {
            return (String) owner.getClass().getMethod("getString", int.class, Object[].class).invoke(owner, id, args);
        } catch (ReflectiveOperationException e) {
            return App.instance.getString(id, args);
        }
    }

    private static String entry(int id) {
        try {
            return App.instance.getResources().getResourceEntryName(id);
        } catch (Resources.NotFoundException e) {
            return null;
        }
    }

    public static java.io.File externalStorage() {
        java.io.File dir = App.instance.getExternalFilesDir(null);
        return dir != null ? dir : App.instance.getFilesDir();
    }

    public static ComponentName startService(Context context, Intent intent) {
        ComponentName target = intent.getComponent();
        if (target != null && target.getClassName().endsWith(".ScribeService")) return null;
        try {
            return context.startService(intent);
        } catch (IllegalStateException | SecurityException e) {
            return null;
        }
    }

    public static void startActivity(Context context, Intent intent) {
        if (!(context instanceof Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    public static int saveLayer(android.graphics.Canvas canvas, android.graphics.RectF bounds, android.graphics.Paint paint, int flags) {
        return canvas.saveLayer(bounds, paint);
    }

    private static Notification channeled(NotificationManager nm, Notification n) {
        if (n.getChannelId() != null || App.instance == null) return n;
        if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_DEFAULT));
        return Notification.Builder.recoverBuilder(App.instance, n).setChannelId(CHANNEL).build();
    }

    public static void notify(NotificationManager nm, int id, Notification n) {
        nm.notify(id, channeled(nm, n));
    }

    public static void notify(NotificationManager nm, String tag, int id, Notification n) {
        nm.notify(tag, id, channeled(nm, n));
    }

    public static void setLatestEventInfo(Notification n, Context context, CharSequence title, CharSequence text, PendingIntent intent) {
        n.contentIntent = intent;
        if (n.extras == null) n.extras = new android.os.Bundle();
        n.extras.putCharSequence(Notification.EXTRA_TITLE, title);
        n.extras.putCharSequence(Notification.EXTRA_TEXT, text);
    }

    public static void requestLocationUpdates(LocationManager lm, String provider, long minTime, float minDistance, LocationListener listener) {
        try {
            lm.requestLocationUpdates(provider, minTime, minDistance, listener);
        } catch (SecurityException | IllegalArgumentException ignored) {
        }
    }

    public static void removeUpdates(LocationManager lm, LocationListener listener) {
        try {
            lm.removeUpdates(listener);
        } catch (SecurityException | IllegalArgumentException ignored) {
        }
    }

    public static boolean isProviderEnabled(LocationManager lm, String provider) {
        try {
            return lm.isProviderEnabled(provider);
        } catch (SecurityException | IllegalArgumentException e) {
            return false;
        }
    }

    public static List<String> getProviders(LocationManager lm, boolean enabledOnly) {
        try {
            return lm.getProviders(enabledOnly);
        } catch (SecurityException e) {
            return Collections.emptyList();
        }
    }

    public static LocationProvider getProvider(LocationManager lm, String name) {
        try {
            return lm.getProvider(name);
        } catch (SecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    public static Location getLastKnownLocation(LocationManager lm, String provider) {
        try {
            return lm.getLastKnownLocation(provider);
        } catch (SecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    public static Cursor query(ContentResolver cr, Uri uri, String[] projection, String selection, String[] args, String order) {
        try {
            return cr.query(uri, projection, selection, args, order);
        } catch (SecurityException e) {
            return null;
        }
    }

    public static Uri insert(ContentResolver cr, Uri uri, ContentValues values) {
        try {
            return cr.insert(uri, values);
        } catch (SecurityException e) {
            return null;
        }
    }

    public static int update(ContentResolver cr, Uri uri, ContentValues values, String where, String[] args) {
        try {
            return cr.update(uri, values, where, args);
        } catch (SecurityException e) {
            return 0;
        }
    }

    public static int delete(ContentResolver cr, Uri uri, String where, String[] args) {
        try {
            return cr.delete(uri, where, args);
        } catch (SecurityException e) {
            return 0;
        }
    }

    public static int bulkInsert(ContentResolver cr, Uri uri, ContentValues[] values) {
        try {
            return cr.bulkInsert(uri, values);
        } catch (SecurityException e) {
            return 0;
        }
    }

    public static ContentProviderResult[] applyBatch(ContentResolver cr, String authority, ArrayList<ContentProviderOperation> ops) throws Exception {
        try {
            return cr.applyBatch(authority, ops);
        } catch (SecurityException e) {
            return new ContentProviderResult[0];
        }
    }
}
