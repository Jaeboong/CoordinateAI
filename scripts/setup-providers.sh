#!/usr/bin/env bash
set -u

if [ "${FORJOB_SKIP_PROVIDER_INSTALL:-0}" = "1" ] || [ "${CI:-0}" = "true" ]; then
  echo "[forjob] Skipping provider auto-install because FORJOB_SKIP_PROVIDER_INSTALL=1 or CI=true."
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[forjob] npm was not found, so Codex and Gemini CLI were not auto-installed."
  exit 0
fi

GLOBAL_PREFIX="$(npm config get prefix 2>/dev/null || true)"
if [ -n "$GLOBAL_PREFIX" ]; then
  echo "[forjob] Global npm prefix: $GLOBAL_PREFIX"
fi

is_wsl=0
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  is_wsl=1
fi

if [ "$is_wsl" = "1" ]; then
  case "$GLOBAL_PREFIX" in
    /mnt/*|[A-Za-z]:\\*)
      echo "[forjob] Detected WSL with a Windows npm global prefix."
      echo "[forjob] Skipping Codex/Gemini auto-install to avoid broken Windows shims inside WSL."
      echo "[forjob] Install a Linux Node.js runtime first (for example with nvm), then rerun: npm run setup:providers"
      exit 0
      ;;
  esac
fi

install_provider() {
  local command_name="$1"
  local package_name="$2"
  local label="$3"

  if command -v "$command_name" >/dev/null 2>&1; then
    echo "[forjob] $label is already available as '$command_name'."
    return 0
  fi

  echo "[forjob] '$command_name' was not found. Attempting to install $label with npm..."
  if npm install -g --no-fund --no-audit "$package_name"; then
    if command -v "$command_name" >/dev/null 2>&1; then
      echo "[forjob] $label installed successfully."
    else
      echo "[forjob] $label install finished, but '$command_name' is still not on PATH in this shell."
      echo "[forjob] Restart VS Code or update your PATH, then test the provider again."
    fi
  else
    echo "[forjob] Failed to auto-install $label."
    echo "[forjob] You can install it manually with: npm install -g $package_name"
  fi
}

install_provider "codex" "@openai/codex" "Codex CLI"
install_provider "gemini" "@google/gemini-cli" "Gemini CLI"
