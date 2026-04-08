# VSIX Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repository-level harness that packages the extension as a VSIX and reapplies it to the WSL-installed VS Code environment with one command.

**Architecture:** Keep the product runtime unchanged and add repository-level shell scripts under `scripts/` plus package entry points in `package.json`. The harness should build and test first, create a deterministic VSIX artifact with repo-local tooling, install it through the `code` CLI inside WSL, and verify the installed version without relying on manual `rsync` copying.

**Tech Stack:** shell scripts, npm script aliases, Python zip packaging, existing `with-node.sh`, README/docs updates

**Status:** Completed

---

### Task 1: Add VSIX packaging primitives

**Files:**
- Create: `scripts/package-vsix.sh`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1:** Add a shell script that reads the current package version and writes a `.vsix` artifact into a repo-local output directory.

**Step 2:** Wire package/install/verify/deploy entry points into `package.json` as aliases for the shell harness.

**Step 3:** Ignore generated VSIX artifacts in git.

**Step 4:** Validate the packaging command locally.

### Task 2: Add WSL install and verify harness commands

**Files:**
- Create: `scripts/install-wsl-extension.sh`
- Create: `scripts/verify-wsl-extension.sh`
- Modify: `package.json`

**Step 1:** Add an install script that finds the latest generated VSIX and installs it with `code --install-extension --force`.

**Step 2:** Add a verify script that checks `code --list-extensions --show-versions` for the current package version.

**Step 3:** Add a combined `deploy:wsl-extension` script that runs build, test, package, install, and verify.

**Step 4:** Validate the install and verify commands locally in WSL.

### Task 3: Document the harness workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/development/OPERATING_RULES.md`

**Step 1:** Document the new package/install/verify commands in the README developer workflow.

**Step 2:** Add a short note in development docs that WSL extension refresh should go through the VSIX harness rather than manual folder copying.

**Step 3:** Mention that developers still need `Developer: Reload Window` after install.

### Notes

- Risks: hand-rolled VSIX packaging can be sensitive to manifest/files mismatches; keep the harness minimal and deterministic.
- Follow-up: add a Windows-local install harness only if that becomes a recurring need.
- Validation run:
  - `./scripts/package-vsix.sh`
  - `./scripts/install-wsl-extension.sh`
  - `./scripts/verify-wsl-extension.sh`
  - `./scripts/deploy-wsl-extension.sh`
