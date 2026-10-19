#!/usr/bin/env bash
set -euo pipefail
cd "$1"
L="http://127.0.0.1:${REVIVAL_PORT:?}"
sedi -E \
  -e "s#(<string name=\"(base_host|base_url|base_url_mobile|mobile_config_url)\">)https?://(api|mobile)\.twitter\.com#\1$L#" \
  res/values/strings.xml
sedi "s#const-string v2, \"http://api.twitter.com/\"#const-string v2, \"$L/\"#" smali/com/twitter/library/network/a.smali
grep -rl '"https://twitter.com/scribe"' smali* | while read -r f; do sedi "s#\"https://twitter.com/scribe\"#\"$L/scribe\"#" "$f"; done
left=$(grep -nE '<string name="(base_host|base_url|base_url_mobile|mobile_config_url)">https' res/values/strings.xml || true)
[ -z "$left" ] || { echo "unpatched: $left"; exit 1; }
[ "$(grep -c "$L/" smali/com/twitter/library/network/a.smali)" = 2 ] || { echo "network/a not patched"; exit 1; }
