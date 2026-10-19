package revival;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

public final class PickedProvider extends ContentProvider {
    private static final String[] DEFAULT = {"_id", "_data", "_display_name", "mime_type", "_size", "orientation", "width", "height"};

    static Uri uriFor(Context context, File file) {
        return Uri.parse("content://" + context.getPackageName() + ".provider.revivalpicked/" + file.getName());
    }

    private File file(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.startsWith(".")) throw new FileNotFoundException(String.valueOf(uri));
        File f = new File(new File(getContext().getCacheDir(), "picked"), name);
        if (!f.isFile()) throw new FileNotFoundException(f.getPath());
        return f;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        String name = String.valueOf(uri.getLastPathSegment());
        return name.endsWith(".png") ? "image/png" : name.endsWith(".gif") ? "image/gif" : "image/jpeg";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        File f;
        try {
            f = file(uri);
        } catch (FileNotFoundException e) {
            return null;
        }
        String[] columns = projection == null || projection.length == 0 ? DEFAULT : projection;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getPath(), bounds);
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            switch (columns[i]) {
                case "_id": row[i] = 1L; break;
                case "_data": row[i] = f.getAbsolutePath(); break;
                case "_display_name": case "title": row[i] = f.getName(); break;
                case "mime_type": row[i] = getType(uri); break;
                case "_size": row[i] = f.length(); break;
                case "orientation": row[i] = 0; break;
                case "width": row[i] = bounds.outWidth; break;
                case "height": row[i] = bounds.outHeight; break;
                case "datetaken": case "date_added": case "date_modified": row[i] = f.lastModified(); break;
                default: row[i] = null;
            }
        }
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String name = String.valueOf(uri.getLastPathSegment());
        if (name.startsWith("cap_") && mode != null && mode.contains("w")) {
            if (name.contains("/") || name.startsWith(".")) throw new FileNotFoundException(name);
            File dir = new File(getContext().getCacheDir(), "picked");
            dir.mkdirs();
            return ParcelFileDescriptor.open(new File(dir, name), ParcelFileDescriptor.parseMode(mode));
        }
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
