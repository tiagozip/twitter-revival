#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/search_entities.py" "$1"
