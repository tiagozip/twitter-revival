Java.perform(() => {
  const P = Java.use("p");
  P.a.overloads.forEach((o) => {
    if (o.argumentTypes.length !== 0) return;
    o.implementation = function () {
      const r = o.call(this);
      const req = this.q.value;
      console.log(
        `HTTP ${req.getMethod()} ${req.getURI()} -> c=${this.c.value} d=${this.d.value} e=${this.e.value}`,
      );
      return r;
    };
  });
  console.log("ready");
});
