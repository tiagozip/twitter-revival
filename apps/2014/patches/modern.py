import re
import sys

root = sys.argv[1]


def edit(rel, fn):
    path = f"{root}/smali/{rel}"
    src = open(path).read()
    out = fn(src)
    if out == src:
        sys.exit(f"no change in {rel}")
    open(path, "w").write(out)


def patch(text, header, old, new, locals_count):
    if text.count(header) != 1:
        sys.exit(f"method count {text.count(header)}: {header}")
    start = text.index(header)
    end = text.index(".end method", start)
    body = text[start:end]
    if body.count(old) != 1:
        sys.exit(f"anchor count {body.count(old)} in {header}: {old!r}")
    found = re.search(r"\n    \.locals (\d+)\n", body)
    if not found or int(found[1]) != locals_count:
        sys.exit(f"unexpected .locals in {header}: {found and found[1]}")
    return text[:start] + body.replace(old, new) + text[end:]


def need(rel, *lines):
    src = open(f"{root}/smali/{rel}").read()
    for line in lines:
        if line not in src:
            sys.exit(f"missing in {rel}: {line}")


view = "com/twitter/library/widget/TweetView.smali"
need(
    view,
    ".field private final M:I\n",
    ".field private final O:I\n",
    ".field private final P:I\n",
    ".field private aT:F\n",
    ".field private aX:F\n",
    ".field private bQ:I\n",
    ".field private final cc:Landroid/graphics/Rect;\n",
)
need("com/twitter/library/provider/Tweet.smali", ".field public A:Lcom/twitter/library/api/TweetEntities;\n", ".field public H:I\n", ".field public N:Lcom/twitter/library/api/TwitterStatusCard;\n")
need("com/twitter/library/api/TwitterStatusCard.smali", ".field public media:Lcom/twitter/library/api/TweetMedia;\n")
need(
    "com/twitter/applib/widget/TweetDetailView.smali",
    ".field h:Lcom/twitter/library/provider/Tweet;\n",
    ".field private r:Landroid/view/ViewGroup;\n",
)

edit(view, lambda s: patch(
    s,
    ".method public setTweet(Lcom/twitter/library/provider/Tweet;)V",
    "    :cond_8\n    :goto_2\n    move-object/from16 v0, p1\n\n    iget-wide v4, v0, Lcom/twitter/library/provider/Tweet;->j:J\n",
    "    :cond_8\n    :goto_2\n    invoke-static/range {p0 .. p1}, Lrevival/InlineMedia;->bind(Landroid/view/View;Ljava/lang/Object;)V\n\n    move-object/from16 v0, p1\n\n    iget-wide v4, v0, Lcom/twitter/library/provider/Tweet;->j:J\n",
    17,
))
edit(view, lambda s: patch(
    s,
    ".method protected onMeasure(II)V",
    "    :goto_10\n    add-int v28, v5, v21\n",
    """    :goto_10
    add-int v28, v5, v21

    move-object/from16 v0, p0

    move/from16 v2, v20

    invoke-static {v0, v2}, Lrevival/InlineMedia;->space(Landroid/view/View;I)I

    move-result v2

    add-int v28, v28, v2
""",
    45,
))
edit(view, lambda s: patch(
    s,
    ".method protected onDraw(Landroid/graphics/Canvas;)V",
    "    :cond_b\n    if-eqz v3, :cond_33\n",
    """    :cond_b
    move-object/from16 v0, p0

    move-object/from16 v1, p1

    invoke-static {v0, v1, v14, v4}, Lrevival/InlineMedia;->drawAt(Landroid/view/View;Landroid/graphics/Canvas;II)I

    move-result v0

    add-int/2addr v4, v0

    if-eqz v3, :cond_33
""",
    29,
))

detail = "com/twitter/applib/widget/TweetDetailView.smali"
edit(detail, lambda s: patch(
    s,
    ".method public a(Lcom/twitter/library/provider/Tweet;Lcom/twitter/applib/client/a;Lcom/twitter/library/widget/ab;Lcom/twitter/library/api/TweetEntities;)V",
    "    :goto_4\n    invoke-virtual {p0}, Lcom/twitter/applib/widget/TweetDetailView;->a()V\n",
    "    :goto_4\n    invoke-static {p0, p4}, Lrevival/Detail;->attachView(Landroid/view/View;Ljava/lang/Object;)V\n\n    invoke-virtual {p0}, Lcom/twitter/applib/widget/TweetDetailView;->a()V\n",
    8,
))
edit(detail, lambda s: patch(
    s,
    ".method private a(Landroid/view/ViewGroup;)V",
    "    invoke-virtual {v0, v1}, Landroid/view/ViewGroup;->setVisibility(I)V\n\n    .line 824\n    return-void\n",
    "    invoke-virtual {v0, v1}, Landroid/view/ViewGroup;->setVisibility(I)V\n\n    invoke-static {p0}, Lrevival/Spec;->detailNative(Landroid/view/View;)V\n\n    .line 824\n    return-void\n",
    2,
))


def limit(rel, value, count):
    def fn(src):
        if src.count(", 0x8c\n") != count:
            sys.exit(f"expected {count} limits in {rel}, found {src.count(', 0x8c' + chr(10))}")
        return src.replace(", 0x8c\n", f", {value}\n")
    edit(rel, fn)


limit("com/twitter/applib/PostActivity.smali", "0x118", 3)
limit("com/twitter/applib/TweetBoxFragment.smali", "0x118", 1)
limit("com/twitter/applib/lv.smali", "0x118", 2)
limit("com/twitter/applib/MessagesThreadFragment.smali", "0x2710", 3)
strings = f"{root}/res/values/strings.xml"
text = open(strings).read()
if '<string name="max_chars">140</string>' not in text:
    sys.exit("max_chars string missing")
open(strings, "w").write(text.replace('<string name="max_chars">140</string>', '<string name="max_chars">280</string>'))
edit("com/twitter/library/util/k.smali", lambda src: patch(
    src,
    ".method public getAttribute(Ljava/lang/String;)Ljava/lang/String;",
    "    iget-object v0, p0, Lcom/twitter/library/util/k;->a:Ljava/util/HashMap;\n\n    invoke-virtual {v0, p1}",
    "    iget-object v0, p0, Lcom/twitter/library/util/k;->a:Ljava/util/HashMap;\n\n    if-nez v0, :revival_map\n\n    invoke-super {p0, p1}, Landroid/media/ExifInterface;->getAttribute(Ljava/lang/String;)Ljava/lang/String;\n\n    move-result-object v0\n\n    return-object v0\n\n    :revival_map\n    invoke-virtual {v0, p1}",
    1,
))
edit("com/twitter/applib/widget/TweetDetailView.smali", lambda src: patch(
    src,
    ".method public a(Lcom/twitter/applib/client/a;)V",
    "    :cond_2\n    iget-object v0, p0, Lcom/twitter/applib/widget/TweetDetailView;->a:Landroid/widget/ImageView;\n",
    "    :cond_2\n    invoke-static {p0, p1}, Lrevival/Extras;->retry(Ljava/lang/Object;Ljava/lang/Object;)V\n\n    iget-object v0, p0, Lcom/twitter/applib/widget/TweetDetailView;->a:Landroid/widget/ImageView;\n",
    4,
))
edit("com/twitter/applib/widget/p.smali", lambda src: src.replace(
    "    invoke-interface {p3, v3}, Landroid/database/Cursor;->getString(I)Ljava/lang/String;\n\n    move-result-object v2\n\n    invoke-direct {v0, v2}, Ljava/io/File;-><init>(Ljava/lang/String;)V\n",
    "    invoke-interface {p3, v3}, Landroid/database/Cursor;->getString(I)Ljava/lang/String;\n\n    move-result-object v2\n\n    if-nez v2, :revival_path\n\n    const-string v2, \"\"\n\n    :revival_path\n    invoke-direct {v0, v2}, Ljava/io/File;-><init>(Ljava/lang/String;)V\n",
    1,
))
