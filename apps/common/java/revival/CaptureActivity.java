package revival;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public final class CaptureActivity extends Activity {
    private static final int REQUEST = 0x6361;
    private File shot;
    private Uri target;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) {
            String path = state.getString("shot");
            shot = path == null ? null : new File(path);
            target = state.getParcelable("target");
            return;
        }
        target = getIntent().getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        ClipData clip = getIntent().getClipData();
        if (target == null && clip != null && clip.getItemCount() > 0) target = clip.getItemAt(0).getUri();
        File dir = new File(getCacheDir(), "picked");
        dir.mkdirs();
        shot = new File(dir, "cap_" + System.currentTimeMillis() + ".jpg");
        Uri out = PickedProvider.uriFor(this, shot);
        Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, out)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        capture.setClipData(ClipData.newRawUri("output", out));
        try {
            startActivityForResult(capture, REQUEST);
        } catch (Throwable t) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (shot != null) state.putString("shot", shot.getPath());
        state.putParcelable("target", target);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request != REQUEST || result != RESULT_OK || shot == null || !shot.isFile() || shot.length() == 0) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        Intent reply = new Intent();
        try {
            if (target != null && "file".equals(target.getScheme())) {
                File dest = new File(target.getPath());
                File parent = dest.getParentFile();
                if (parent != null) parent.mkdirs();
                try (InputStream in = new FileInputStream(shot); OutputStream os = new FileOutputStream(dest)) {
                    byte[] buffer = new byte[65536];
                    for (int n = in.read(buffer); n != -1; n = in.read(buffer)) os.write(buffer, 0, n);
                }
                shot.delete();
                reply.setData(target);
            } else {
                reply.setData(PickedProvider.uriFor(this, shot)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            setResult(RESULT_OK, reply);
        } catch (Throwable t) {
            setResult(RESULT_CANCELED);
        }
        finish();
    }
}
