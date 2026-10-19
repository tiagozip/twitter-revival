import sys

root = sys.argv[1]


def swap(rel, header, old, new):
    path = f"{root}/smali/{rel}"
    src = open(path).read()
    start = src.index(header)
    end = src.index(".end method", start)
    body = src[start:end]
    if old not in body:
        sys.exit(f"{old!r} not in {rel} {header}")
    open(path, "w").write(src[:start] + body.replace(old, new) + src[end:])


swap("com/twitter/android/PostActivity.smali", ".method private i()V", "const/16 v4, 0x8c", "const/16 v4, 0x118")
swap("com/twitter/android/aa.smali", ".method public final onTextChanged", "const/16 v1, 0x8c", "const/16 v1, 0x2710")
mt = f"{root}/smali/com/twitter/android/MessagesThreadActivity.smali"
src = open(mt).read()
if src.count("const/16 v2, 0x8c") != 1:
    sys.exit("dm limit anchor")
open(mt, "w").write(src.replace("const/16 v2, 0x8c", "const/16 v2, 0x2710"))
strings = f"{root}/res/values/strings.xml"
s = open(strings).read()
open(strings, "w").write(s.replace('<string name="post_max_chars">140</string>', '<string name="post_max_chars">280</string>'))
