import sys

path = sys.argv[1]
src = open(path).read()
start = src.index(".method public connectSocket(Ljava/net/Socket;Ljava/lang/String;ILjava/net/InetAddress;ILorg/apache/http/params/HttpParams;)Ljava/net/Socket;")
end = src.index(".end method", start)
body = src[start:end]
body = body.replace("    .locals 4\n", "    .locals 6\n", 1)
anchor = "    invoke-virtual {v0, v3, v1}, Ljavax/net/ssl/SSLSocket;->connect(Ljava/net/SocketAddress;I)V\n"
if anchor not in body:
    sys.exit("connect anchor not found")
sni = """    :try_start_sni
    invoke-virtual {v0}, Ljavax/net/ssl/SSLSocket;->getSSLParameters()Ljavax/net/ssl/SSLParameters;

    move-result-object v4

    new-instance v5, Ljavax/net/ssl/SNIHostName;

    invoke-direct {v5, p2}, Ljavax/net/ssl/SNIHostName;-><init>(Ljava/lang/String;)V

    invoke-static {v5}, Ljava/util/Collections;->singletonList(Ljava/lang/Object;)Ljava/util/List;

    move-result-object v5

    invoke-virtual {v4, v5}, Ljavax/net/ssl/SSLParameters;->setServerNames(Ljava/util/List;)V

    invoke-virtual {v0, v4}, Ljavax/net/ssl/SSLSocket;->setSSLParameters(Ljavax/net/ssl/SSLParameters;)V
    :try_end_sni
    .catch Ljava/lang/Exception; {:try_start_sni .. :try_end_sni} :catch_sni

    :goto_sni
"""
body = body.replace(anchor, sni + anchor, 1)
body += """    :catch_sni
    move-exception v4

    goto :goto_sni
"""
open(path, "w").write(src[:start] + body + src[end:])
