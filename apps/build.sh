#!/usr/bin/env bash
set -euo pipefail
APPS="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$APPS/.." && pwd)"
COMMON="$APPS/common"

fail() { echo "error: $*" >&2; exit 1; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
for guess in "$SDK" "$HOME/Library/Android/sdk" "/opt/homebrew/share/android-commandlinetools" "$HOME/Android/Sdk"; do
  [ -n "$guess" ] && [ -d "$guess/build-tools/34.0.0" ] && SDK="$guess" && break
done
[ -d "$SDK/build-tools/34.0.0" ] || fail "Android build-tools 34.0.0 not found. Install them with: sdkmanager \"build-tools;34.0.0\" \"platforms;android-34\", then set ANDROID_HOME"
BT="$SDK/build-tools/34.0.0"
AJAR="$SDK/platforms/android-34/android.jar"
[ -f "$AJAR" ] || fail "platforms;android-34 not found in $SDK. Install it with: sdkmanager \"platforms;android-34\""

for guess in "${JAVA_HOME:-}" "/opt/homebrew/opt/openjdk@17" "/usr/lib/jvm/java-17-openjdk-amd64" "/usr/lib/jvm/java-17-openjdk"; do
  [ -n "$guess" ] && [ -x "$guess/bin/javac" ] && export JAVA_HOME="$guess" && break
done
[ -x "${JAVA_HOME:-}/bin/javac" ] || fail "JDK 17 not found. Install it and set JAVA_HOME"
export PATH="$COMMON/bin:$JAVA_HOME/bin:$PATH"
command -v apktool >/dev/null || fail "apktool not found. Install it from https://apktool.org"
command -v python3 >/dev/null || fail "python3 not found"

KS="$ROOT/keys/revival.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$ROOT/keys"
  keytool -genkeypair -keystore "$KS" -storepass revival -keypass revival -alias revival -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Twitter Revival" >/dev/null 2>&1
  echo "made a new signing key in keys/revival.keystore"
fi

build() {
  local ERA="$APPS/$1"
  [ -f "$ERA/era.conf" ] || fail "unknown app '$1', pick 2011, 2012 or 2014"
  local SOURCE_APK OUTPUT_APK PORT
  source "$ERA/era.conf"
  local APK="$ROOT/apks/$SOURCE_APK"
  [ -f "$APK" ] || fail "apks/$SOURCE_APK is missing. See apks/README.md for where to get it"
  local BUILD="$ERA/build"
  local TREE="$BUILD/tree"
  local OUT="$BUILD/$OUTPUT_APK"
  [ -n "${REVIVAL_SERVER:-}" ] && OUT="${OUT%.apk}-dev.apk"
  export REVIVAL_PORT="$PORT"

  rm -rf "$TREE" "$BUILD/classes" "$BUILD/dex" "$BUILD/gen" && mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/gen/revival"
  apktool d -f -q "$APK" -o "$TREE"
  python3 "$COMMON/patchlib.py" modernize "$TREE"
  python3 "$COMMON/patchlib.py" safe-calls "$TREE"
  python3 "$COMMON/patchlib.py" px-to-dp "$TREE"
  for p in "$ERA"/patches/[0-9]*.sh; do
    echo "patch $(basename "$p")"
    "$p" "$TREE"
  done
  apktool b -q -f "$TREE" -o "$BUILD/unsigned.apk"
  printf 'package revival;\n\npublic final class BuildConfig {\n    public static final String DEFAULT_SERVER = "%s";\n\n    private BuildConfig() {}\n}\n' "${REVIVAL_SERVER:-}" > "$BUILD/gen/revival/BuildConfig.java"
  javac --release 8 -nowarn -cp "$AJAR" -d "$BUILD/classes" $(find "$COMMON/java" "$ERA/java" "$BUILD/gen" -name '*.java') 2>&1 | grep -v "^warning\|^Note\|^[0-9]* warning" || true
  "$BT/d8" --min-api 26 --lib "$AJAR" --output "$BUILD/dex" $(find "$BUILD/classes" -name '*.class')
  mv "$BUILD/dex/classes.dex" "$BUILD/dex/classes2.dex"
  (cd "$BUILD/dex" && zip -q "$BUILD/unsigned.apk" classes2.dex)
  "$BT/zipalign" -p -f 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
  "$BT/apksigner" sign --ks "$KS" --ks-pass pass:revival --ks-key-alias revival --key-pass pass:revival --out "$OUT" "$BUILD/aligned.apk"
  rm -f "$BUILD/unsigned.apk" "$BUILD/aligned.apk" "$OUT.idsig"
  echo "built ${OUT#"$ROOT/"}"
}

for era in "${@:-2011 2012 2014}"; do
  for e in $era; do build "$e"; done
done
