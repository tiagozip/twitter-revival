import sys

root = sys.argv[1]
path = f"{root}/smali/cs.smali"
src = open(path).read()
header = ".method private static q(Lbg;)Le;"
start = src.index(header)
end = src.index(".end method", start)
body = src[start:end]
skip = "    :cond_9\n    invoke-virtual/range {p0 .. p0}, Lbg;->h()Lbg;\n"
built = "    invoke-direct/range {v2 .. v16}, Le;-><init>(JJLjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;JII)V\n"
if body.count(skip) != 1 or body.count(built) != 1:
    sys.exit("search parser anchors not found")
body = body.replace(skip, """    :cond_9
    const-string v5, "entities"

    invoke-virtual {v5, v2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v5

    if-eqz v5, :revival_skip

    invoke-static/range {p0 .. p0}, Lay;->a(Lbg;)Lay;

    move-result-object v5

    invoke-static {v5}, Lrevival/Detail;->stash(Ljava/lang/Object;)V

    goto :revival_parsed

    :revival_skip
    invoke-virtual/range {p0 .. p0}, Lbg;->h()Lbg;

    :revival_parsed
""")
body = body.replace(built, built + "\n    invoke-static {v2}, Lrevival/Detail;->unstash(Ljava/lang/Object;)V\n")
open(path, "w").write(src[:start] + body + src[end:])
