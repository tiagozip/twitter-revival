#!/usr/bin/env bash
set -euo pipefail
cd "$1"
NEW="$2"
export NEW
python3 - <<'PY'
import os, re
m = open("AndroidManifest.xml").read()
m = re.sub(r'android:name="\.', 'android:name="com.twitter.android.', m)
m = m.replace('package="com.twitter.android"', f'package="{os.environ["NEW"]}"', 1)
open("AndroidManifest.xml", "w").write(m)
PY
grep -rl 'http://schemas.android.com/apk/res/com.twitter.android"' res | while read -r f; do
  sedi 's#http://schemas.android.com/apk/res/com.twitter.android"#http://schemas.android.com/apk/res-auto"#g' "$f"
done
grep -rlE 'com\.twitter\.android\.(provider\.|auth\.login|permission\.)' smali res AndroidManifest.xml | while read -r f; do
  sedi -E "s/com\.twitter\.android\.(provider\.|auth\.login|permission\.)/$NEW.\1/g" "$f"
done
python3 - <<'PY'
import os, re
new = re.escape(os.environ["NEW"])
m = open("AndroidManifest.xml").read()
m = re.sub(rf'(<provider\b[^>]*?android:name="){new}\.provider\.', r'\1com.twitter.android.provider.', m)
m = re.sub(rf'(<(?:activity|service|receiver)\b[^>]*?android:name="){new}\.', r'\1com.twitter.android.', m)
open("AndroidManifest.xml", "w").write(m)
PY
