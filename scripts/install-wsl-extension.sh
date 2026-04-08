#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$("${ROOT_DIR}/scripts/with-node.sh" -p "require('${ROOT_DIR}/package.json').version")"
VSIX_PATH="${ROOT_DIR}/.artifacts/vsix/local.forjob-${VERSION}.vsix"

if ! command -v code >/dev/null 2>&1; then
  echo "[forjob] 'code' CLI를 찾지 못했습니다. WSL VS Code 서버 환경에서 실행하세요." >&2
  exit 1
fi

if [ ! -f "${VSIX_PATH}" ]; then
  echo "[forjob] VSIX가 없습니다: ${VSIX_PATH}" >&2
  echo "[forjob] 먼저 ./scripts/package-vsix.sh 또는 npm run package:vsix 를 실행하세요." >&2
  exit 1
fi

code --install-extension "${VSIX_PATH}" --force
echo "[forjob] Installed ${VSIX_PATH}"
