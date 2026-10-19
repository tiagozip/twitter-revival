#!/usr/bin/env bash
set -euo pipefail
cd "$1"
NEW=com.twitter.android.holo
grep -rlE 'com\.twitter\.android\.(provider\.|auth\.login|permission\.)' res AndroidManifest.xml smali* | while read -r f; do
  sedi -E "s/com\.twitter\.android\.(provider\.|auth\.login|permission\.)/$NEW.\1/g" "$f"
done
sedi "s/package=\"com.twitter.android\"/package=\"$NEW\"/" AndroidManifest.xml
sedi "s/const-string v6, \"com.twitter.android\"$/const-string v6, \"$NEW\"/" smali/com/twitter/android/TwitterApplication.smali
sedi "s/const-string v0, \"com.twitter.android\"$/const-string v0, \"$NEW\"/" smali/com/twitter/library/App.smali
grep -q "package=\"$NEW\"" AndroidManifest.xml || { echo "package not renamed"; exit 1; }
grep -q "\"$NEW\"" smali/com/twitter/library/App.smali || { echo "App.e not renamed"; exit 1; }
grep -q "\"$NEW\"" smali/com/twitter/android/TwitterApplication.smali || { echo "TwitterApplication not renamed"; exit 1; }
