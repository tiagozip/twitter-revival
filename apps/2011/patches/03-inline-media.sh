#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/inline_media.py" "$1"
