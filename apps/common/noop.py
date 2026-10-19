import re
import sys

path, sig = sys.argv[1], sys.argv[2]
src = open(path).read()
pat = re.compile(rf"(\.method [^\n]*{re.escape(sig)}\n    \.locals \d+\n)")
src, n = pat.subn(lambda m: f"{m[1]}\n    return-void\n", src, count=1)
if n != 1:
    sys.exit(f"{sig} not found in {path}")
open(path, "w").write(src)
