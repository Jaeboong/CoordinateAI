# Role-Based Runs UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current coordinator/reviewer run setup with role-based run assignments, while keeping execution backward-compatible with the existing orchestrator in Phase 1.

**Architecture:** Introduce a new `roleAssignments` shape in the run protocol, view models, and persistence layer; migrate the Runs webview to render top-level role rows plus advanced override controls; then adapt controller/orchestrator plumbing to translate role assignments into the current coordinator/reviewer execution model until the full role-based orchestrator exists.

**Tech Stack:** TypeScript, Zod, VS Code webview UI, existing ForJob storage/orchestrator stack

---

### Task 1: Add role assignment types and schemas

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/core/viewModels.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1: Define top-level run role identifiers and assignment types**

Add role identifiers for:
- `context_researcher`
- `section_coordinator`
- `section_drafter`
- `fit_reviewer`
- `evidence_reviewer`
- `voice_reviewer`
- `finalizer`

Add a role assignment type with:
- `role`
- `providerId`
- `useProviderDefaults`
- `modelOverride`
- `effortOverride`

**Step 2: Extend runtime/request/persistence types**

Update:
- `RunRequest`
- `RunRecord`
- continuation preset types if needed

Add `roleAssignments` and keep legacy coordinator/reviewer fields for compatibility during Phase 1.

**Step 3: Extend Zod schemas**

Add corresponding schemas and backward-compatible parsing defaults.

**Step 4: Add schema tests**

Update `src/test/webviewProtocol.test.ts` to cover:
- valid `roleAssignments`
- optional override fields
- backward compatibility for older run records/payloads

### Task 2: Update controller/storage plumbing for role assignments

**Files:**
- Modify: `src/controller/forJobController.ts`
- Modify: `src/core/storage.ts`
- Possibly modify: `src/controller/sidebarStateStore.ts`
- Test: `src/test/storage.test.ts`

**Step 1: Pass role assignments through run start/continuation**

Update `startRun()`, continuation loading, and continuation start logic to read/write `roleAssignments`.

**Step 2: Persist role assignments in run records**

Ensure saved runs retain the role assignment list.

**Step 3: Add compatibility helpers**

Add a helper that derives the current orchestrator inputs from role assignments:
- `section_coordinator` -> legacy coordinator
- review roles -> legacy reviewers
- ignore non-runtime roles for now or store for future runtime use

**Step 4: Add storage/controller coverage**

Verify runs round-trip with role assignments present.

### Task 3: Replace Runs UI participant selection with role assignment UI

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1: Replace coordinator/reviewer local state**

Replace:
- `runCoordinatorSelection`
- `runReviewerSelections`

with role assignment state plus advanced options visibility state.

**Step 2: Render grouped top-level role rows**

Render:
- `Research`
- `Drafting`
- `Review`

with one provider select per top-level role.

**Step 3: Add advanced options toggle**

Add UI to show/hide role-specific override fields:
- provider default toggle
- model override
- effort override when supported

**Step 4: Update run submission**

Send `roleAssignments` in `runReview` payload and validate required roles before submission.

**Step 5: Update UI smoke test**

Replace coordinator/reviewer assertions with role-based strings and advanced-option markers.

### Task 4: Preserve current execution behavior via role-to-legacy mapping

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/types.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Introduce a mapping boundary**

Near the orchestrator entry point, derive current coordinator/reviewer participants from `roleAssignments`.

**Step 2: Keep legacy runtime untouched deeper in the orchestrator**

Do not rewrite the full multi-role execution engine yet.

Phase 1 mapping:
- legacy coordinator = `section_coordinator`
- legacy reviewers = `fit_reviewer`, `evidence_reviewer`, `voice_reviewer`

Researcher, drafter, and finalizer assignments are stored and surfaced in UI but not yet executed as distinct phases.

**Step 3: Update prompt labels or participant labels only where needed**

Avoid broad churn; keep existing deep/realtime execution stable.

**Step 4: Add orchestrator coverage**

Verify that role assignments produce the expected coordinator/reviewer slot participants.

### Task 5: Update docs and verify

**Files:**
- Modify: `README.md`
- Possibly modify: `docs/plans/2026-04-03-role-based-runs-ui-design.md`
- Test: `npm run test`

**Step 1: Document the Phase 1 behavior**

Clarify that:
- Runs UI is role-based
- provider defaults come from `Providers`
- advanced overrides exist
- distinct runtime execution for researcher/drafter/finalizer is future work

**Step 2: Run tests**

Run:

```bash
npm run test
```

**Step 3: Review**

Do a focused review of:
- schema compatibility
- UI interaction correctness
- role-to-legacy mapping safety
