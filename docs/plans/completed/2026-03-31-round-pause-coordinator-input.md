# Round Pause Coordinator Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pause automatically after each reviewer round, let the user press Enter to continue or add a short intervention, and inject that intervention into the next coordinator turn.

**Architecture:** Keep the current sequential orchestrator, but add a pause callback after each reviewer round. The extension controller owns a deferred promise for the active pause, the webview shows an input box when a pause event arrives, and any submitted message is emitted as a `You` chat message plus injected into the next coordinator prompt.

**Tech Stack:** TypeScript, VS Code Webview UI, local CLI orchestration, node:test

---

### Task 1: Add pause and user-intervention event types

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`

**Steps:**
1. Add pause/resume run event variants.
2. Extend chat speaker roles to include `user`.
3. Make sure persisted chat message schema accepts user messages.

### Task 2: Add pause callback support to the orchestrator

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Steps:**
1. Introduce an optional pause callback invoked after each reviewer round.
2. Store any returned text as pending coordinator guidance.
3. Inject the most recent guidance into the next coordinator prompt.
4. Emit pause/resume events so the UI can react.

### Task 3: Add deferred pause handling in the extension controller

**Files:**
- Modify: `src/extension.ts`

**Steps:**
1. Track the currently paused run in the controller.
2. Resolve the pause promise when the webview submits input.
3. Emit a `You` chat message event for non-empty interventions.

### Task 4: Add the pause input UI

**Files:**
- Modify: `src/webview/sidebar.ts`

**Steps:**
1. Show a coordinator guidance input box when a pause event arrives.
2. Submit blank input on Enter to continue unchanged.
3. Render the user’s intervention as a `You` chat bubble.
4. Clear the input when the run resumes.

### Task 5: Verify and document

**Files:**
- Modify: `README.md`
- Test: `src/test/orchestrator.test.ts`

**Steps:**
1. Add tests for blank resume and non-empty coordinator intervention.
2. Update the README with the round-pause flow.
3. Run `npm run test` and confirm the suite passes.
