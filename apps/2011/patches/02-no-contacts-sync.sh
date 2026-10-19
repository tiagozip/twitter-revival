#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/../../common/noop.py" "$1/smali/com/twitter/android/platform/k.smali" "onPerformSync(Landroid/accounts/Account;Landroid/os/Bundle;Ljava/lang/String;Landroid/content/ContentProviderClient;Landroid/content/SyncResult;)V"
