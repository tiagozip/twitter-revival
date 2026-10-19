#!/usr/bin/env bash
set -euo pipefail
cd "$1"
L="http://127.0.0.1:${REVIVAL_PORT:?}"
sedi -E \
  -e "s#(<string name=\"(base_host|base_url|oauth_echo_url_json|oauth_echo_url_xml|base_url_mobile|base_url_upload|profile_image_url)\">)https?://(api|mobile|upload)\.twitter\.com#\1$L#" \
  res/values/strings.xml
sedi -e "s|\"http://api.twitpic.com/2/upload.xml\"|\"$L/twitpic/upload.xml\"|" \
  -e "s|\"http://yfrog.com/api/xauth_upload\"|\"$L/yfrog/upload\"|" smali/com/twitter/android/util/j.smali
sedi -e "s|\"https://twitter.com/scribe\"|\"$L/scribe\"|" smali/com/twitter/android/service/ScribeService.smali
left=$(grep -nE '<string name="(base_host|base_url|base_url_mobile|base_url_upload)">https' res/values/strings.xml || true)
[ -z "$left" ] || { echo "unpatched: $left"; exit 1; }
grep -q "$L/twitpic" smali/com/twitter/android/util/j.smali || { echo "twitpic not patched"; exit 1; }
