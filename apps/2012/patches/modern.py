import sys

root = sys.argv[1]


def edit(rel, fn):
    path = f"{root}/smali/{rel}"
    src = open(path).read()
    out = fn(src)
    if out == src:
        sys.exit(f"no change in {rel}")
    open(path, "w").write(out)


def patch(text, header, old, new):
    start = text.index(header)
    end = text.index(".end method", start)
    body = text[start:end]
    if body.count(old) != 1:
        sys.exit(f"anchor count {body.count(old)} in {header}: {old!r}")
    return text[:start] + body.replace(old, new) + text[end:]


view = "com/twitter/android/widget/TweetView.smali"
edit(view, lambda s: patch(
    s,
    ".method public final a(Lcom/twitter/android/provider/m;)V",
    "    :cond_5\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n",
    "    :cond_5\n    invoke-static {p0, p1}, Lrevival/InlineMedia;->bind(Landroid/view/View;Ljava/lang/Object;)V\n\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n",
))
edit(view, lambda s: patch(
    s,
    ".method protected onDraw(Landroid/graphics/Canvas;)V",
    "    :cond_0\n    :goto_0\n    return-void\n",
    "    :cond_0\n    :goto_0\n    invoke-static {p0, p1}, Lrevival/InlineMedia;->draw(Landroid/view/View;Landroid/graphics/Canvas;)V\n\n    return-void\n",
))
edit(view, lambda s: patch(
    s,
    ".method protected onMeasure(II)V",
    "    invoke-virtual {v0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V\n",
    """    invoke-virtual {v0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V

    invoke-static {v0}, Lrevival/InlineMedia;->extraHeight(Landroid/view/View;)I

    move-result v1

    if-eqz v1, :revival_no_media

    invoke-virtual {v0}, Lcom/twitter/android/widget/TweetView;->getMeasuredHeight()I

    move-result v2

    add-int/2addr v2, v1

    invoke-virtual {v0}, Lcom/twitter/android/widget/TweetView;->getMeasuredWidth()I

    move-result v1

    invoke-virtual {v0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V

    :revival_no_media
""",
))
edit("com/twitter/android/widget/TweetDetailView.smali", lambda s: patch(
    s,
    ".method public final a(Lcom/twitter/android/provider/m;Lcom/twitter/android/client/b;Lcom/twitter/android/widget/ad;Lcom/twitter/android/api/TweetEntities;)V",
    "    :goto_3\n    return-void\n",
    "    :goto_3\n    invoke-static {p0, p4}, Lrevival/Detail;->attachView(Landroid/view/View;Ljava/lang/Object;)V\n\n    return-void\n",
))
edit("com/twitter/android/PostActivity.smali", lambda s: s.replace(", 0x8c\n", ", 0x118\n"))
edit("com/twitter/android/MessagesThreadActivity.smali", lambda s: s.replace(", 0x8c\n", ", 0x2710\n"))
