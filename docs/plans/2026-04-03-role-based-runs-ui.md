# Role-Based Runs UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current coordinator/reviewer run setup with role-based assignments plus advanced per-role override plumbing, while keeping the current runtime executable through a compatibility bridge.

**Architecture:** Add explicit role assignment types and schemas as the new source of truth for Runs setup. Update the webview to render top-level essay roles instead of coordinator/reviewer rows, then adapt controller and orchestrator entry points to derive the current coordinator/reviewer runtime shape from those role assignments so the app stays runnable during the architecture transition.

**Tech Stack:** TypeScript, VS Code webview UI, Zod schemas, existing ForJob storage/orchestrator pipeline

---

### Task 1: Add role assignment domain types and protocol schemas

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/core/viewModels.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1:** Define top-level agent role ids, role assignment shape, and optional model/effort override fields.

**Step 2:** Extend Zod schemas for continuation preset, run request message, and stored run record compatibility.

**Step 3:** Keep backward compatibility by allowing legacy `coordinatorProvider` / `reviewerProviders` on persisted runs while making `roleAssignments` the preferred runtime input.

**Step 4:** Update protocol tests to validate new `roleAssignments` payloads and legacy parsing behavior.

### Task 2: Update Runs UI state and rendering to role-based setup

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1:** Replace local run form state for coordinator/reviewer rows with role assignment state keyed by top-level role ids.

**Step 2:** Render a new `역할 배치` section grouped into Research / Drafting / Review, each row showing role label, provider select, and provider default model summary.

**Step 3:** Add an advanced options disclosure for per-role override controls (`useProviderDefaults`, `modelOverride`, `effortOverride`) without making them required in the default UI.

**Step 4:** Update submit/reset/continuation hydration logic to use role assignments.

**Step 5:** Refresh sidebar script smoke tests for new strings and removed legacy reviewer-row affordances where appropriate.

### Task 3: Adapt controller and continuation flow to role assignments

**Files:**
- Modify: `src/controller/forJobController.ts`
- Modify: `src/webview/sidebar.ts` if protocol helper signatures change
- Possibly modify: `src/controller/sidebarStateStore.ts` only if state payload shape must expose role metadata

**Step 1:** Update `startRun`, `loadRunContinuation`, and continuation restart paths to accept and emit role assignments.

**Step 2:** Add a compatibility mapper that derives the current runtime participants from role assignments.

**Step 3:** Preserve continuation behavior by serializing role assignments into run records and falling back to legacy provider fields when reading older runs.

### Task 4: Bridge the current orchestrator to the new role model

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/storage.ts` if run record persistence needs compatibility handling
- Test: `src/test/orchestrator.test.ts`

**Step 1:** Add helpers that derive the current coordinator provider and reviewer slots from the top-level roles.

**Step 2:** Rename reviewer lens mapping from technical/interviewer/authenticity to evidence/fit/voice while keeping current prompt flow intact.

**Step 3:** If feasible with low risk, use role-derived providers for obvious bridges such as Notion pre-pass research provider and final draft provider; otherwise keep a narrow compatibility bridge and document the deferred runtime split.

**Step 4:** Update orchestrator tests to validate the new role-to-runtime mapping and continuation compatibility.

### Task 5: Update docs and verify end-to-end behavior

**Files:**
- Modify: `README.md`
- Modify: relevant design docs only if implementation notes must be reflected

**Step 1:** Update README Runs tab description to explain role-based assignment and advanced override behavior.

**Step 2:** Run focused tests for protocol, sidebar script, orchestrator, and any affected controller/storage suites.

**Step 3:** Run the broader test suite and fix regressions.
