import os
import sys

root = sys.argv[1]
view = f"{root}/smali/com/twitter/android/widget/TweetView.smali"
src = open(view).read()


def section(text, header):
    start = text.index(header)
    end = text.index(".end method", start)
    return start, end


def patch(text, header, old, new):
    start, end = section(text, header)
    body = text[start:end]
    if body.count(old) != 1:
        sys.exit(f"anchor not unique in {header}: {old!r}")
    return text[:start] + body.replace(old, new) + text[end:]


src = patch(
    src,
    ".method public final a(Lcom/twitter/android/provider/aj;)V",
    "    :cond_8\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n",
    "    :cond_8\n    invoke-static {p0, p1}, Lrevival/InlineMedia;->bind(Landroid/view/View;Ljava/lang/Object;)V\n\n    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->b()V\n",
)
src = patch(
    src,
    ".method protected onDraw(Landroid/graphics/Canvas;)V",
    "    :cond_0\n    :goto_0\n    return-void\n",
    "    :cond_0\n    :goto_0\n    invoke-static {p0, p1}, Lrevival/InlineMedia;->draw(Landroid/view/View;Landroid/graphics/Canvas;)V\n\n    return-void\n",
)
src = patch(
    src,
    ".method protected onMeasure(II)V",
    "    invoke-virtual {p0, v10, v0}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V\n",
    """    invoke-virtual {p0, v10, v0}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V

    invoke-static {p0}, Lrevival/InlineMedia;->extraHeight(Landroid/view/View;)I

    move-result v0

    if-eqz v0, :revival_no_media

    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->getMeasuredWidth()I

    move-result v1

    invoke-virtual {p0}, Lcom/twitter/android/widget/TweetView;->getMeasuredHeight()I

    move-result v2

    add-int/2addr v2, v0

    invoke-virtual {p0, v1, v2}, Lcom/twitter/android/widget/TweetView;->setMeasuredDimension(II)V

    :revival_no_media
""",
)
open(view, "w").write(src)

media = f"{root}/smali/r.smali"
src = open(media).read()
src = patch(
    src,
    ".method public static b(Ljava/lang/String;)Z",
    "    .locals 6\n",
    """    .locals 6

    const-string v0, "http://127.0.0.1:__PORT__/"

    invoke-virtual {p0, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :revival_not_img

    const/4 v0, 0x1

    return v0

    :revival_not_img
""".replace("__PORT__", os.environ["REVIVAL_PORT"]),
)
open(media, "w").write(src)
