Java.perform(() => {
  const bp = Java.use("com.twitter.android.bp");
  bp.a.overload(
    "com.twitter.android.client.Session",
    "java.lang.String",
    "int",
    "java.lang.String",
    "java.lang.String",
  ).implementation = function (s, a, code, b, c) {
    console.log(`login callback code=${code} msg=${b}`);
    return this.a(s, a, code, b, c);
  };
  const AM = Java.use("android.accounts.AccountManager");
  AM.addAccountExplicitly.overload(
    "android.accounts.Account",
    "java.lang.String",
    "android.os.Bundle",
  ).implementation = function (acc, p, b) {
    const r = this.addAccountExplicitly(acc, p, b);
    console.log(`addAccountExplicitly ${acc} -> ${r}`);
    return r;
  };
  const T = Java.use("java.lang.Throwable");
  T.$init.overload("java.lang.String").implementation = function (m) {
    if (m && !/^(Expected|Unexpected)/.test(m)) console.log(`throwable: ${m}`);
    return this.$init(m);
  };
});
