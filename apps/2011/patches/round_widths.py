import re
import sys

path = f"{sys.argv[1]}/smali/com/twitter/android/widget/TweetView.smali"
src = open(path).read()
pat = re.compile(r"(Landroid/text/Layout;->getDesiredWidth\(Ljava/lang/CharSequence;Landroid/text/TextPaint;\)F\n\n    move-result (v\d+)\n\n(?:    \.line \d+\n)?    float-to-int (v\d+), \2\n)")
src, n = pat.subn(lambda m: f"{m[1]}\n    add-int/lit8 {m[3]}, {m[3]}, 0x2\n", src)
if n != 3:
    sys.exit(f"expected 3 getDesiredWidth sites, patched {n}")
open(path, "w").write(src)
