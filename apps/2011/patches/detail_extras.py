import re
import sys

root = sys.argv[1]
path = f"{root}/smali/com/twitter/android/ca.smali"
src = open(path).read()
pat = re.compile(r"(    invoke-static \{(v\d+), (v\d+), (v\d+), (v\d+)\}, Lcom/twitter/android/TweetActivity;->a\(Lcom/twitter/android/TweetActivity;Ljava/lang/CharSequence;\[Landroid/widget/ImageView;Lay;\)V\n)")
src, n = pat.subn(lambda m: f"{m[1]}\n    invoke-static {{{m[2]}, {m[5]}}}, Lrevival/Detail;->attach(Landroid/app/Activity;Ljava/lang/Object;)V\n", src)
if n != 1:
    sys.exit(f"detail preview call not found ({n})")
open(path, "w").write(src)

manifest = f"{root}/AndroidManifest.xml"
m = open(manifest).read()
entry = '<activity android:name="revival.MediaActivity" android:configChanges="orientation|keyboardHidden|screenSize" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"/>'
if "revival.MediaActivity" not in m:
    m = m.replace("</application>", f"    {entry}\n    </application>", 1)
if 'android:hardwareAccelerated="true"' not in m:
    m = m.replace("<application ", '<application android:hardwareAccelerated="true" ', 1)
open(manifest, "w").write(m)
