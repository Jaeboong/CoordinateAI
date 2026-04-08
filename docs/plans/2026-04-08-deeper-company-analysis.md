# Deeper Company Analysis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an artifact-first company source bundle and dedicated company-analysis generation flow so `company-insight.md` explains the company itself, its business model, recent direction, role relevance, and essay-ready angles with explicit source coverage.

**Architecture:** Keep the existing project insight storage and workspace, but insert a new official-source collection stage ahead of insight generation. Persist machine-readable source artifacts under `insights/`, generate `company-profile.json` and `company-insight.md` through a dedicated company-analysis pass, then generate the remaining insight documents with the synthesized company profile as input.

**Tech Stack:** TypeScript, VS Code extension host, existing storage facade/run repository, provider-backed prompt execution, node:test with deterministic fetch fixtures

---

### Task 1: Add company source collection and persisted artifacts

**Files:**
- Create: `src/core/companySources.ts`
- Modify: `src/controller/handlers/insightHandlers.ts`
- Test: `src/test/companySources.test.ts`
- Test: `src/test/storage.test.ts`

**Steps:**
1. Collect an official-first company source bundle from OpenDART, the resolved homepage, same-origin discoverable about/business/careers pages, and low-risk IR/press/tech links.
2. Persist `company-source-manifest.json` and `company-source-snippets.json` under the existing project `insights/` directory.
3. Keep per-source fetch failures non-blocking and record explicit coverage gaps instead of masking them.
4. Add deterministic fixture tests for discovery, snippet extraction, and graceful fallback.

### Task 2: Split company analysis from the shared four-file insight prompt

**Files:**
- Modify: `src/core/insights.ts`
- Modify: `src/controller/handlers/insightHandlers.ts`
- Test: `src/test/insights.test.ts`

**Steps:**
1. Introduce a dedicated company-analysis pass that consumes the company source bundle and returns `company-profile.json` plus `company-insight.md`.
2. Reshape `company-insight.md` to the design-doc section order and make coverage weakness explicit.
3. Generate the remaining three insight documents in a second pass that reuses the synthesized company profile.
4. Persist `company-profile.json` and keep the existing generated project documents pinned by default.

### Task 3: Surface source coverage in the insight workspace company tab

**Files:**
- Modify: `src/controller/handlers/insightHandlers.ts`
- Modify: `src/webview/insightWorkspaceScript.ts`
- Modify: `src/webview/insightWorkspaceStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Steps:**
1. Load source manifest/profile artifacts when opening the insight workspace.
2. Show coverage summary, collected source types, freshness, and omissions in the company tab without redesigning the whole workspace.
3. Keep the company tab usable even when homepage or optional discoverable sources fail.
4. Add a script-level regression test that asserts the new coverage labels render in the workspace script.

### Task 4: Run focused deterministic validation

**Files:**
- Test: `src/test/companySources.test.ts`
- Test: `src/test/insights.test.ts`
- Test: `src/test/storage.test.ts`
- Test: `src/test/sidebarScript.test.ts`

**Steps:**
1. Run the focused tests for company source collection, insight orchestration, storage persistence, and workspace rendering.
2. Run a build if the touched files affect compile-time contracts.
3. Record any intentionally deferred external-enrichment work in the final handoff.
