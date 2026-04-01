# Continue Run Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users continue from a previous run by pre-filling the Runs form and injecting the previous run's results into the next run's prompt context.

**Architecture:** Keep each review execution as a new run, but add optional continuation metadata that points back to a prior run in the same project. The extension loads a continuation preset for the UI, and the orchestrator reads the previous run's saved artifacts to build a `Previous Run Context` section inside the new compiled context.

**Tech Stack:** TypeScript, VS Code webview, node:test, existing `.forjob` run artifacts

---

### Task 1: Add continuation metadata to run types

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`

**Step 1: Extend `RunRecord` and `RunRequest`**

Add optional fields for:
- `continuationFromRunId`
- `continuationNote`

**Step 2: Preserve schema validation**

Update zod schemas so old runs still parse and new continuation runs validate correctly.

### Task 2: Add storage helper for continuation context

**Files:**
- Modify: `src/core/storage.ts`

**Step 1: Add a helper to load previous run context**

Return the previous run record plus optional artifacts needed for continuation:
- `summary.md`
- `improvement-plan.md`
- `revised-draft.md`
- `notion-brief.md`
- `chat-messages.json`

### Task 3: Inject previous run context into the orchestrator

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Build a continuation markdown block**

Create a `Previous Run Context` section from the loaded artifacts.

**Step 2: Save the enriched compiled context**

Append the continuation block before saving `compiled-context.md` and before building prompts.

**Step 3: Persist continuation metadata**

Save the continuation source run id on the new run record.

**Step 4: Add a regression test**

Verify the coordinator/reviewer prompts include previous run context when continuing from a run.

### Task 4: Add Continue UI and preset loading

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/webview/sidebar.ts`

**Step 1: Add a message to load a continuation preset**

Read the previous run, choose a starting draft (`revised-draft.md` if present, else previous draft), and post the preset to the webview.

**Step 2: Add a `Continue` button in Recent runs**

Place it next to the artifact buttons.

**Step 3: Prefill the Runs form**

Show a `Continuing from <run id>` card and prefill:
- question
- draft
- notion request
- coordinator
- reviewer set
- rounds

**Step 4: Allow clearing the preset**

Add a `Clear continuation` action.

### Task 5: Update docs and run tests

**Files:**
- Modify: `README.md`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Document the feature**

Explain that `Continue` starts a new run with the previous run's context, rather than reopening a provider-native session.

**Step 2: Run full verification**

Run: `npm run test`

Expected: all tests pass.
