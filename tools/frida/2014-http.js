Java.perform(() => {
  const C = Java.use("org.apache.http.impl.client.AbstractHttpClient");
  C.execute.overloads.forEach((o) => {
    o.implementation = function (...args) {
      const HR = Java.use("org.apache.http.HttpRequest");
      const req = args.find(
        (a) => a?.$className && /Http(Get|Post|Request)|Request/.test(a.$className),
      );
      const what = req ? `${Java.cast(req, HR).getRequestLine()}` : args.map(String).join(" ");
      try {
        const r = o.apply(this, args);
        console.log(
          `HTTP ${what} -> ${Java.cast(r, Java.use("org.apache.http.HttpResponse")).getStatusLine()}`,
        );
        return r;
      } catch (e) {
        console.log(`HTTP ${what} THREW ${e}`);
        throw e;
      }
    };
  });
  const U = Java.use("java.net.URL");
  U.openConnection.overload().implementation = function () {
    console.log(`URL.openConnection ${this.toString()}`);
    return this.openConnection();
  };
  console.log("http hooks ready");
});
