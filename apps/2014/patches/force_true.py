import re
import sys

path, *methods = sys.argv[1:]
src = open(path).read()
for m in methods:
    pat = re.compile(rf"(\.method public {re.escape(m)}\(\)Z\n    \.locals )(\d+)(\n)")
    src, n = pat.subn(lambda x: f"{x[1]}{max(int(x[2]), 1)}{x[3]}\n    const/4 v0, 0x1\n\n    return v0\n", src, count=1)
    if n != 1:
        sys.exit(f"method {m} not found in {path}")
open(path, "w").write(src)
