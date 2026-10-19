Java.perform(() => {
  const ag = Java.use("com.twitter.library.api.ag");
  const h = ag.a.overload("int", "int", "java.io.InputStream");
  h.implementation = function (status, len, stream) {
    const kind = this.a.value;
    try {
      h.call(this, status, len, stream);
      const g = this.g.value;
      console.log(
        `ag kind=${kind} status=${status} len=${len} -> ${g === null ? "null" : `${g.$className} ${g.toString().slice(0, 150)}`}`,
      );
    } catch (e) {
      console.log(`ag kind=${kind} status=${status} THREW ${e}\n${e.stack}`);
      throw e;
    }
  };
  const v = Java.use("com.twitter.library.util.v");
  v.a.overloads.forEach((o) => {
    o.implementation = function (...args) {
      console.log(`v.a(${args.map(String).join(", ")})`);
      return o.apply(this, args);
    };
  });
  console.log("hooks ready");
});
