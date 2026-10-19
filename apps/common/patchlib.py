import os
import re
import shutil
import sys

DANGEROUS = [
    "READ_CONTACTS",
    "WRITE_CONTACTS",
    "ACCESS_FINE_LOCATION",
    "ACCESS_COARSE_LOCATION",
    "WRITE_EXTERNAL_STORAGE",
    "READ_EXTERNAL_STORAGE",
    "READ_PHONE_STATE",
    "CAMERA",
    "RECORD_AUDIO",
    "READ_CALL_LOG",
    "WRITE_CALL_LOG",
    "READ_SMS",
    "RECEIVE_SMS",
]

SAFE_CALLS = {
    "Landroid/location/LocationManager;": [
        "requestLocationUpdates(Ljava/lang/String;JFLandroid/location/LocationListener;)V",
        "removeUpdates(Landroid/location/LocationListener;)V",
        "isProviderEnabled(Ljava/lang/String;)Z",
        "getProviders(Z)Ljava/util/List;",
        "getProvider(Ljava/lang/String;)Landroid/location/LocationProvider;",
        "getLastKnownLocation(Ljava/lang/String;)Landroid/location/Location;",
    ],
    "Landroid/app/Notification;": [
        "setLatestEventInfo(Landroid/content/Context;Ljava/lang/CharSequence;Ljava/lang/CharSequence;Landroid/app/PendingIntent;)V",
    ],
    "Landroid/content/Context;": [
        "startService(Landroid/content/Intent;)Landroid/content/ComponentName;",
        "startActivity(Landroid/content/Intent;)V",
    ],
    "Landroid/graphics/Canvas;": [
        "saveLayer(Landroid/graphics/RectF;Landroid/graphics/Paint;I)I",
    ],
    "Landroid/app/NotificationManager;": [
        "notify(ILandroid/app/Notification;)V",
        "notify(Ljava/lang/String;ILandroid/app/Notification;)V",
    ],
    "Landroid/content/ContentResolver;": [
        "query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;",
        "insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;",
        "update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I",
        "delete(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)I",
        "bulkInsert(Landroid/net/Uri;[Landroid/content/ContentValues;)I",
        "applyBatch(Ljava/lang/String;Ljava/util/ArrayList;)[Landroid/content/ContentProviderResult;",
    ],
}


def read(path):
    with open(path) as f:
        return f.read()


def write(path, text):
    with open(path, "w") as f:
        f.write(text)


def modernize(tree, target_sdk=28):
    yml = os.path.join(tree, "apktool.yml")
    y = read(yml)
    y, n = re.subn(r"targetSdkVersion: '?\d+'?", f"targetSdkVersion: {target_sdk}", y)
    if n != 1:
        sys.exit("targetSdkVersion not found in apktool.yml")
    write(yml, y)

    lib = os.path.join(tree, "lib")
    if os.path.isdir(lib) and "arm64-v8a" not in os.listdir(lib):
        shutil.rmtree(lib)
        print("dropped 32-bit only native libraries")

    manifest = os.path.join(tree, "AndroidManifest.xml")
    m = read(manifest)
    for perm in DANGEROUS:
        m = re.sub(rf'\s*<uses-permission android:name="android\.permission\.{perm}"\s*/>', "", m)
    app = re.search(r"<application\b[^>]*>", m).group(0)
    existing = re.search(r'\sandroid:name="([^"]+)"', app)
    if existing:
        cls = existing[1]
        if cls.startswith("."):
            pkg = re.search(r'<manifest[^>]*\spackage="([^"]+)"', m)[1]
            cls = pkg + cls
        reparent(tree, cls)
        new_app = app
    else:
        new_app = app.replace("<application ", '<application android:name="revival.App" ', 1)
    if "android:hardwareAccelerated" not in new_app:
        new_app = new_app.replace("<application ", '<application android:hardwareAccelerated="true" ', 1)
    if "android:usesCleartextTraffic" not in new_app:
        new_app = new_app.replace("<application ", '<application android:usesCleartextTraffic="true" ', 1)
    m = m.replace(app, new_app, 1)
    if "org.apache.http.legacy" not in m:
        m = m.replace("</application>", '    <uses-library android:name="org.apache.http.legacy" android:required="false"/>\n    </application>', 1)
    if "revival.MediaActivity" not in m:
        entry = '<activity android:name="revival.MediaActivity" android:configChanges="orientation|keyboardHidden|screenSize" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"/>'
        m = m.replace("</application>", f"    {entry}\n    </application>", 1)
    if "revival.PickActivity" not in m:
        entry = ('<activity android:name="revival.PickActivity" android:exported="false" android:theme="@android:style/Theme.Translucent.NoTitleBar">'
                 '<intent-filter><action android:name="revival.intent.action.PICK_IMAGE"/><category android:name="android.intent.category.DEFAULT"/>'
                 '<data android:mimeType="vnd.android.cursor.dir/image"/><data android:mimeType="image/*"/></intent-filter></activity>')
        provider = '<provider android:name="revival.PickedProvider" android:authorities="com.twitter.android.provider.revivalpicked" android:exported="false" android:grantUriPermissions="true"/>'
        m = m.replace("</application>", f"    {entry}\n    {provider}\n    </application>", 1)
    if "revival.CaptureActivity" not in m:
        entry = ('<activity android:name="revival.CaptureActivity" android:exported="false" android:configChanges="orientation|keyboardHidden|screenSize" android:theme="@android:style/Theme.Translucent.NoTitleBar">'
                 '<intent-filter><action android:name="revival.intent.action.CAPTURE"/><category android:name="android.intent.category.DEFAULT"/></intent-filter></activity>')
        m = m.replace("</application>", f"    {entry}\n    </application>", 1)
    write(manifest, m)
    pick_images(tree)
    capture_images(tree)
    quote_calls(tree)


def quote_calls(tree):
    public = read(os.path.join(tree, "res", "values", "public.xml"))
    found = re.search(r'type="string" name="quote_format" id="(0x[0-9a-f]+)"', public)
    if not found:
        print("quote_calls: no quote_format string")
        return
    rid = int(found[1], 16)
    refs = re.compile(rf"(?:const(?:/high16)? [vp]\d+, {found[1]}\n|;->quote_format:I\n)")
    call = re.compile(r"invoke-virtual(/range)? \{([^}]*)\}, L[^;]+;->getString\(I\[Ljava/lang/Object;\)Ljava/lang/String;")
    total = 0
    for smali in (d for d in os.listdir(tree) if d.startswith("smali")):
        for root, _, files in os.walk(os.path.join(tree, smali)):
            for f in files:
                path = os.path.join(root, f)
                src = read(path)
                if found[1] not in src and "->quote_format:I" not in src:
                    continue
                def method(mm):
                    nonlocal total
                    body = mm[0]
                    if not refs.search(body):
                        return body
                    out, n = call.subn(lambda c: f"invoke-static{c[1] or ''} {{{c[2]}}}, Lrevival/Safe;->quote(Ljava/lang/Object;I[Ljava/lang/Object;)Ljava/lang/String;", body)
                    total += n
                    return out
                changed = re.sub(r"^\.method .*?^\.end method", method, src, flags=re.M | re.S)
                if changed != src:
                    write(path, changed)
    print(f"quote_calls: wrapped {total} quote prefills (id {rid:#x})")


def capture_images(tree):
    actions = storage = 0
    for smali in (d for d in os.listdir(tree) if d.startswith("smali")):
        for root, _, files in os.walk(os.path.join(tree, smali)):
            for f in files:
                path = os.path.join(root, f)
                src = read(path)
                changed = src.replace('"android.media.action.IMAGE_CAPTURE"', '"revival.intent.action.CAPTURE"')
                actions += src.count('"android.media.action.IMAGE_CAPTURE"')
                storage += changed.count("Landroid/os/Environment;->getExternalStorageDirectory()Ljava/io/File;")
                changed = changed.replace("invoke-static {}, Landroid/os/Environment;->getExternalStorageDirectory()Ljava/io/File;", "invoke-static {}, Lrevival/Safe;->externalStorage()Ljava/io/File;")
                if changed != src:
                    write(path, changed)
    print(f"capture_images: rerouted {actions} camera intents and {storage} storage lookups")


def pick_images(tree):
    total = 0
    marker = re.compile(r'"vnd\.android\.cursor\.dir/image"|MediaStore\$Images\$Media;->EXTERNAL_CONTENT_URI|"image/')
    for smali in (d for d in os.listdir(tree) if d.startswith("smali")):
        for root, _, files in os.walk(os.path.join(tree, smali)):
            for f in files:
                path = os.path.join(root, f)
                src = read(path)
                if '"android.intent.action.PICK"' not in src:
                    continue
                def method(mm):
                    nonlocal total
                    body = mm[0]
                    if not marker.search(body):
                        return body
                    total += body.count('"android.intent.action.PICK"')
                    return body.replace('"android.intent.action.PICK"', '"revival.intent.action.PICK_IMAGE"')
                changed = re.sub(r"^\.method .*?^\.end method", method, src, flags=re.M | re.S)
                if changed != src:
                    write(path, changed)
    print(f"pick_images: rerouted {total} image pickers")


def reparent(tree, cls):
    roots = sorted(d for d in os.listdir(tree) if d.startswith("smali"))
    while True:
        path = next((p for p in (os.path.join(tree, r, *cls.split(".")) + ".smali" for r in roots) if os.path.exists(p)), None)
        if path is None:
            sys.exit(f"{cls} not found while looking for the Application subclass")
        src = read(path)
        if ".super Landroid/app/Application;" in src:
            break
        parent = re.search(r"^\.super L([^;]+);", src, re.M)
        cls = parent.group(1).replace("/", ".")
    src = src.replace(".super Landroid/app/Application;", ".super Lrevival/App;")
    src = src.replace("Landroid/app/Application;-><init>()V", "Lrevival/App;-><init>()V")
    src = src.replace("invoke-super {p0}, Landroid/app/Application;->onCreate()V", "invoke-super {p0}, Lrevival/App;->onCreate()V")
    if ".method public onCreate()V" in src and "Lrevival/App;->onCreate()V" not in src:
        sys.exit(f"{cls} has no onCreate calling super")
    write(path, src)
    print(f"reparented {cls} onto revival.App")


def safe_calls(tree):
    total = 0
    patterns = []
    for owner, methods in SAFE_CALLS.items():
        for sig in methods:
            name, rest = sig.split("(", 1)
            params, ret = rest.split(")", 1)
            patterns.append((owner, name, params, ret))
    for root, _, files in os.walk(os.path.join(tree, "smali")):
        if os.sep + "revival" in root:
            continue
        for f in files:
            if not f.endswith(".smali"):
                continue
            path = os.path.join(root, f)
            src = read(path)
            changed = src
            for owner, name, params, ret in patterns:
                needle = f"}}, {owner}->{name}({params}){ret}"
                if needle not in changed:
                    continue
                changed = re.sub(
                    rf"invoke-virtual(/range)? \{{([^}}]*)\}}, {re.escape(owner)}->{re.escape(name)}\({re.escape(params)}\){re.escape(ret)}",
                    lambda mm: f"invoke-static{mm[1] or ''} {{{mm[2]}}}, Lrevival/Safe;->{name}({owner}{params}){ret}",
                    changed,
                )
            changed = re.sub(
                r"invoke-virtual(/range)? \{([^}]*)\}, L(?!android/content/Context;)[^;]+;->startService\(Landroid/content/Intent;\)Landroid/content/ComponentName;",
                lambda mm: f"invoke-static{mm[1] or ''} {{{mm[2]}}}, Lrevival/Safe;->startService(Landroid/content/Context;Landroid/content/Intent;)Landroid/content/ComponentName;",
                changed,
            )
            if changed != src:
                total += src.count("invoke-virtual") - changed.count("invoke-virtual")
                write(path, changed)
    print(f"safe_calls: rewrote {total} call sites")


BUCKETS = {"ldpi": 0.75, "mdpi": 1.0, "tvdpi": 1.33125, "hdpi": 1.5, "xhdpi": 2.0}


def px_to_dp(tree):
    res = os.path.join(tree, "res")
    changed = 0
    for folder in os.listdir(res):
        if not folder.startswith("values"):
            continue
        scale = next((v for k, v in BUCKETS.items() if re.search(rf"(^|-){k}(-|$)", folder)), None)
        if scale is None:
            continue
        path = os.path.join(res, folder, "dimens.xml")
        if not os.path.exists(path):
            continue
        src = read(path)

        def convert(m):
            nonlocal changed
            changed += 1
            return f"{m[1]}{round(float(m[2]) / scale, 2)}dp{m[3]}"

        out = re.sub(r"(<dimen name=\"[^\"]+\">)(-?\d+(?:\.\d+)?)px(</dimen>)", convert, src)
        write(path, out)
    print(f"px_to_dp: converted {changed} dimensions")


if __name__ == "__main__":
    cmd, tree = sys.argv[1], sys.argv[2]
    if cmd == "modernize":
        modernize(tree)
    elif cmd == "safe-calls":
        safe_calls(tree)
    elif cmd == "px-to-dp":
        px_to_dp(tree)
    else:
        sys.exit(f"unknown command {cmd}")
