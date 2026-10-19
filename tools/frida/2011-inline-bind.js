Java.perform(() => {
  const IM = Java.use("revival.InlineMedia");
  let shown = 0;
  IM.bind.implementation = function (v, t) {
    if (shown++ < 2) {
      try {
        const f = v.getClass().getDeclaredField("e");
        f.setAccessible(true);
        const src = f.get(v);
        console.log(
          `tweet=${t === null ? "null" : t.getClass().getName()} provider=${src === null ? "null" : src.getClass().getName()}`,
        );
        if (src !== null) {
          const ms = src.getClass().getMethods();
          for (let i = 0; i < ms.length; i++) {
            const m = ms[i];
            if (m.getName() === "b")
              console.log(
                `  b(${m.getParameterTypes().map((x) => x.getName())}) -> ${m.getReturnType().getName()}`,
              );
          }
        }
      } catch (e) {
        console.log(`inspect failed ${e}`);
      }
    }
    return this.bind(v, t);
  };
  console.log("ready");
});
