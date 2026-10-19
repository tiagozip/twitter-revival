Java.perform(() => {
  const Log = Java.use("android.util.Log");
  const Ex = Java.use("java.lang.Exception");
  const AL = Java.use("java.util.ArrayList");
  const cs = Java.use("cs");
  cs.c.overloads.forEach((o) => {
    o.implementation = function (...args) {
      try {
        const r = o.apply(this, args);
        console.log(
          `cs.c(${o.argumentTypes.map((t) => t.className)}) -> ${r === null ? "null" : Java.cast(r, AL).size()}`,
        );
        return r;
      } catch (e) {
        console.log(`cs.c THREW ${e}\n${e.stack || ""}`);
        throw e;
      }
    };
  });
  const T = Java.use("java.lang.Throwable");
  T.$init.overload("java.lang.String").implementation = function (m) {
    this.$init(m);
    const cls = this.getClass().getName();
    if (!/ENOTCONN|ClassNotFound/.test(m || ""))
      console.log(
        `THROWABLE ${cls}: ${m}\n${Log.getStackTraceString(Ex.$new()).split("\n").slice(2, 8).join("\n")}`,
      );
  };
  console.log("ready");
});
