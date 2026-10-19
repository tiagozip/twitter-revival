Java.perform(() => {
  const Log = Java.use("android.util.Log");
  const Ex = Java.use("java.lang.Exception");
  const P = Java.use("p");
  P.a.overloads.forEach((o) => {
    if (o.argumentTypes.length !== 0) return;
    o.implementation = function () {
      const r = o.call(this);
      const req = this.q.value;
      console.log(`HTTP ${req.getMethod()} ${req.getURI()} -> c=${this.c.value} e=${this.e.value}`);
      return r;
    };
  });
  const IOE = Java.use("java.io.IOException");
  IOE.$init.overloads.forEach((o) => {
    o.implementation = function (...args) {
      o.apply(this, args);
      console.log(
        `IOException(${args.map(String).join(", ")})\n${Log.getStackTraceString(Ex.$new()).split("\n").slice(1, 7).join("\n")}`,
      );
    };
  });
  console.log("ready");
});
