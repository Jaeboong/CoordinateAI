#!/usr/bin/env bash
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "/mnt/c/Program Files/nodejs/node.exe" ]; then
  NODE_BIN="/mnt/c/Program Files/nodejs/node.exe"
else
  echo "Unable to locate a usable Node.js binary." >&2
  exit 1
fi

"$NODE_BIN" "$@"
