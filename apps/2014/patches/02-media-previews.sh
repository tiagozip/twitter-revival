#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/force_true.py" "$1/smali/com/twitter/applib/client/a.smali" ab ac ag
