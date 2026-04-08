# Failure Taxonomy

## Purpose

Use this runbook to classify failures quickly before deciding whether the fix belongs in product code, harness code, or local environment setup.

## 1. Deterministic Build/Test Failures

Examples:

- TypeScript compile errors
- failing `node:test` suites
- schema mismatches
- validator failures

First actions:

- reproduce with `npm run build` or `npm run test`
- identify the smallest changed surface
- prefer a deterministic regression test before broad edits

## 2. Harness Validation Failures

Examples:

- missing `agents/*.json` / `agents/*.md` pairs
- broken markdown links in controlled docs
- malformed plan files or governance docs

First actions:

- run the specific harness validator
- fix the contract or the doc, not the symptom
- keep error messages human-readable

## 3. Product Runtime Regressions

Examples:

- orchestration flow changes
- incorrect provider prompt routing
- persistence or artifact regressions
- UI behavior breaks in the sidebar

First actions:

- isolate whether the bug is in `src/core/`, `src/controller/`, or `src/webview/`
- use deterministic tests first
- treat `agents/` and orchestrator changes as high-scrutiny

## 4. Environment Or Credential Failures

Examples:

- provider CLI not installed
- CLI logged out
- Notion MCP disconnected
- machine-specific shell/path issues

First actions:

- do not turn these into blocking CI checks
- document the missing dependency or credential
- use manual smoke or local setup instructions instead of weakening deterministic validation

## 5. Governance Or Review Failures

Examples:

- CODEOWNERS missing for protected paths
- PR template not followed
- CI workflow drift
- required checks not aligned with repo policy

First actions:

- fix `.github/**` and root docs
- confirm the repo UI settings match the checked-in workflow names
- call out any manual GitHub setting required outside the repo

## Related Documents

- [Repository control plane](../../AGENTS.md)
- [Architecture overview](../development/ARCHITECTURE.md)
- [Operating rules](../development/OPERATING_RULES.md)
