# Repository Harness Engineering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repository-level development harness that is clearly separated from the product runtime and provides deterministic validation, review scaffolding, and contributor guidance.

**Architecture:** Keep the existing product runtime under `src/` and `agents/` intact, then add a separate harness plane at the repo root, under `docs/development/`, under `tools/`, and under `.github/`. Deterministic validators will compile through a small dedicated TypeScript config so the existing extension build layout remains unchanged.

**Tech Stack:** TypeScript, Zod, node:test, GitHub Actions, Markdown docs

**Status:** Completed

---

### Task 1: Establish the harness control plane

**Files:**
- Create: `AGENTS.md`
- Create: `docs/development/ARCHITECTURE.md`
- Create: `docs/development/OPERATING_RULES.md`
- Create: `docs/runbooks/failure-taxonomy.md`
- Create: `docs/plans/TEMPLATE.md`

**Step 1:** Document the product-vs-harness boundary and high-risk paths.

**Step 2:** Add development docs for validation policy and mandatory review boundaries.

**Step 3:** Add a reusable plan template for future multi-step work.

### Task 2: Add deterministic harness validators

**Files:**
- Create: `tools/validate-agent-specs.ts`
- Create: `tools/validate-doc-links.ts`
- Create: `tsconfig.tools.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1:** Validate `agents/` JSON/Markdown contract pairs without repurposing them as harness files.

**Step 2:** Validate controlled Markdown links deterministically.

**Step 3:** Expose repo-level commands for deterministic checks and smoke separation.

### Task 3: Add review and CI scaffolding

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/reusable-validate.yml`
- Create: `.github/workflows/pr.yml`

**Step 1:** Protect high-scrutiny paths with CODEOWNERS.

**Step 2:** Add a PR template that captures validation evidence and live-smoke status.

**Step 3:** Add deterministic GitHub workflows for pull requests and merge groups.

### Task 4: Validate and finalize

**Files:**
- Modify: `docs/plans/2026-04-07-repository-harness-engineering.md`

**Step 1:** Run deterministic local validation commands.

**Step 2:** Record outcomes, skipped checks, and manual GitHub follow-ups.

**Step 3:** Mark the plan complete when the harness is wired and verified.

### Notes

- Risks: avoid accidental product-runtime changes, especially under `agents/` and `src/core/orchestrator.ts`.
- Follow-up: add replay fixtures or a manual live-smoke workflow only after deterministic harness checks are stable.
- Validation run:
  - `npm run agent-contracts` via local `npm-cli.js`: PASS
  - `npm run agent-docs` via local `npm-cli.js`: PASS
  - `npm run build` via local `npm-cli.js`: PASS
  - `npm run test` via local `npm-cli.js`: PASS
  - `npm run smoke:local` via local `npm-cli.js`: PASS
  - `npm run smoke:live` via local `npm-cli.js`: PASS as documented stub
  - `npm run agent-check` via local `npm-cli.js`: PASS
