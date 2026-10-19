#!/usr/bin/env bash
set -euo pipefail
"$(dirname "$0")/../../common/rename_package.sh" "$1" com.twitter.android.fly
