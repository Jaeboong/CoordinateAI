#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$("${ROOT_DIR}/scripts/with-node.sh" -p "require('${ROOT_DIR}/package.json').version")"
EXPECTED="local.forjob@${VERSION}"

if ! command -v code >/dev/null 2>&1; then
  echo "[forjob] 'code' CLI를 찾지 못했습니다. WSL VS Code 서버 환경에서 실행하세요." >&2
  exit 1
fi

if code --list-extensions --show-versions | grep -Fx "${EXPECTED}" >/dev/null 2>&1; then
  echo "[forjob] Verified ${EXPECTED}"
  exit 0
fi

echo "[forjob] Expected installed extension ${EXPECTED} was not found." >&2
exit 1
