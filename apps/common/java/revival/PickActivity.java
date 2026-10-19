package revival;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public final class PickActivity extends Activity {
    private static final int REQUEST = 0x7069;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) return;
        Intent pick = new Intent(MediaStore.ACTION_PICK_IMAGES);
        if (Build.VERSION.SDK_INT < 33 || pick.resolveActivity(getPackageManager()) == null) {
            pick = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        }
        try {
            startActivityForResult(pick, REQUEST);
        } catch (Throwable t) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int request, int result, final Intent data) {
        if (request != REQUEST || result != RESULT_OK || data == null || data.getData() == null) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        final Uri source = data.getData();
        new Thread(new Runnable() {
            @Override
            public void run() {
                Intent out = null;
                try {
                    File dir = new File(getCacheDir(), "picked");
                    dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) {
                        for (File f : old) {
                            if (System.currentTimeMillis() - f.lastModified() > 86400000L) f.delete();
                        }
                    }
                    String type = getContentResolver().getType(source);
                    String ext = type != null && type.endsWith("png") ? "png" : type != null && type.endsWith("gif") ? "gif" : "jpg";
                    File file = new File(dir, "pick_" + System.currentTimeMillis() + "." + ext);
                    try (InputStream in = getContentResolver().openInputStream(source); OutputStream os = new FileOutputStream(file)) {
                        byte[] buffer = new byte[65536];
                        for (int n = in.read(buffer); n != -1; n = in.read(buffer)) os.write(buffer, 0, n);
                    }
                    out = new Intent().setData(PickedProvider.uriFor(PickActivity.this, file)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Throwable ignored) {
                }
                final Intent done = out;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        setResult(done == null ? RESULT_CANCELED : RESULT_OK, done);
                        finish();
                    }
                });
            }
        }).start();
    }
}
