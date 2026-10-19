#!/usr/bin/env bash
set -euo pipefail
cd "$1/smali"
L="http://127.0.0.1:${REVIVAL_PORT:?}"
sedi "s|\"http://api.twitter.com\"|\"$L\"|" ah.smali
sedi "s|\"https://api.twitter.com/1/account/verify_credentials|\"$L/1/account/verify_credentials|" com/twitter/android/dv.smali
sedi -e "s|\"https://api.twitter.com\"|\"$L\"|" \
  -e "s|\"https://mobile.twitter.com/mobile_client_api/signup\"|\"$L/mobile_client_api/signup\"|" \
  -e "s|\"http://search.twitter.com/search.json\"|\"$L/search.json\"|" com/twitter/android/service/TwitterService.smali
sedi -e "s|\"http://api.twitpic.com/2/upload.xml\"|\"$L/twitpic/upload.xml\"|" \
  -e "s|\"http://yfrog.com/api/xauth_upload\"|\"$L/yfrog/upload\"|" com/twitter/android/dv.smali
left=$(grep -rn '"https\{0,1\}://\(api\|search\)\.twitter\.com"\|REVIVAL_PORT' . | grep -v "bv.smali" || true)
[ -z "$left" ] || { echo "unpatched hosts: $left"; exit 1; }
