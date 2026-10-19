Java.perform(() => {
  const ctx = Java.use("android.app.ActivityThread").currentApplication().getApplicationContext();
  const B = Java.use("com.twitter.library.network.ssl.b");
  const S = Java.use("javax.net.ssl.SSLSocket");
  Java.scheduleOnMainThread(() => {});
  const T = Java.use("java.lang.Thread");
  const R = Java.registerClass({
    name: "probe.Tls",
    implements: [Java.use("java.lang.Runnable")],
    methods: {
      run() {
        for (const host of ["pbs.twimg.com", "abs.twimg.com"]) {
          try {
            const f = B.$new(ctx);
            const s = Java.cast(f.createSocket(), S);
            s.connect(Java.use("java.net.InetSocketAddress").$new(host, 443), 5000);
            console.log(`${host} socket class ${s.$className} ${s.getClass().getName()}`);
            s.startHandshake();
            console.log(
              `${host} ok ${s.getSession().getProtocol()} ${s.getSession().getCipherSuite()}`,
            );
          } catch (e) {
            console.log(`${host} FAIL ${e}`);
            const _c = e.getCause ? e : null;
            try {
              const t = Java.cast(e, Java.use("java.lang.Throwable"));
              let x = t;
              while (x) {
                console.log(`  cause: ${x}`);
                x = x.getCause();
              }
            } catch {}
          }
        }
      },
    },
  });
  T.$new(R.$new()).start();
});
