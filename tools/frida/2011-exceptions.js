Java.perform(() => {
  const Log = Java.use("android.util.Log");
  const Ex = Java.use("java.lang.Exception");
  const IOE = Java.use("java.io.IOException");
  IOE.$init.overloads.forEach((o) => {
    o.implementation = function (...args) {
      o.apply(this, args);
      console.log(
        `IOException(${args.map(String).join(", ")})\n${Log.getStackTraceString(Ex.$new()).split("\n").slice(1, 9).join("\n")}`,
      );
    };
  });
  const cs = Java.use("cs");
  cs.c.overloads.forEach((o) => {
    o.implementation = function (...args) {
      const r = o.apply(this, args);
      console.log(
        `cs.c -> ${r === null ? "null" : Java.cast(r, Java.use("java.util.ArrayList")).size()} items`,
      );
      return r;
    };
  });
  console.log("ready");
});
