Java.perform(() => {
  const IM = Java.use("revival.InlineMedia");
  IM.bind.implementation = function (v, t) {
    try {
      this.bind(v, t);
      console.log("bind ok");
    } catch (e) {
      console.log(`bind threw ${e}`);
    }
  };
  IM.extraHeight.implementation = function (v) {
    const r = this.extraHeight(v);
    console.log(`extraHeight ${r}`);
    return r;
  };
  const E = Java.use("revival.Extras");
  E.payloadFromEntities.implementation = function (ay) {
    const r = this.payloadFromEntities(ay);
    console.log(`payload ${ay} -> ${r === null ? "null" : "json"}`);
    return r;
  };
  console.log("ready");
});
