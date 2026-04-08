#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/with-node.sh" "${ROOT_DIR}/node_modules/typescript/lib/tsc.js" -p "${ROOT_DIR}/tsconfig.json"
"${ROOT_DIR}/scripts/with-node.sh" --test "${ROOT_DIR}/dist/test/"*.test.js
"${ROOT_DIR}/scripts/package-vsix.sh"
"${ROOT_DIR}/scripts/install-wsl-extension.sh"
"${ROOT_DIR}/scripts/verify-wsl-extension.sh"

echo "[forjob] Deployment complete. Run 'Developer: Reload Window' in VS Code."
