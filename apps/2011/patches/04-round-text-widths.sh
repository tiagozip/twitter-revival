#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/round_widths.py" "$1"
