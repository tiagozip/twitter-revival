#!/usr/bin/env bash
set -euo pipefail
here="$(dirname "$0")"
smali="$1/smali/com/twitter/library/network/ssl/b.smali"
python3 "$here/sni.py" "$smali"
python3 "$here/system_trust.py" "$smali"
