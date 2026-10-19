import sys

path = sys.argv[1]
src = open(path).read()
start = src.index(".method private a(Lcom/twitter/library/network/ssl/d;)[Ljavax/net/ssl/TrustManager;")
end = src.index(".end method", start)
old = "    iget-object v1, p1, Lcom/twitter/library/network/ssl/d;->a:Ljava/security/KeyStore;\n"
body = src[start:end]
if old not in body:
    sys.exit("keystore load not found")
open(path, "w").write(src[:start] + body.replace(old, "    const/4 v1, 0x0\n", 1) + src[end:])
