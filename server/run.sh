#!/usr/bin/env bash
cd "$(dirname "$0")"
while true; do
  bun run src/server.js
  echo "$(date -u +%FT%TZ) server exited with $?, restarting" >&2
  sleep 1
done
