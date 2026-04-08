# Essay Question Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make essay questions project-owned so the Essay tab runs and completes answers question-by-question without asking the user to paste the question again.

**Architecture:** Persist completed answers as pinned project documents and store lightweight question completion metadata on the project record. Keep in-progress drafts in webview state keyed by question index so unfinished text restores when switching questions but does not enter compiled context until the user presses `완료`.

**Tech Stack:** TypeScript, VS Code webview inline script sections, Zod schemas, node:test

---

### Task 1: Extend project/run models for question workflow metadata

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/core/webviewProtocol.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Steps:**
1. Add persisted project metadata for question answer completion state and optional run metadata for the active project question index.
2. Extend sidebar view models so the webview can receive completed answer content for each question.
3. Add a `completeEssayQuestion` webview message contract and optional question-index metadata for run/continuation payloads.
4. Update schema tests to cover the new payload shapes and backward-compatible parsing.

### Task 2: Persist completed answers through existing project document flows

**Files:**
- Modify: `src/core/storageInterfaces.ts`
- Modify: `src/core/storage.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Test: `src/test/storage.test.ts`
- Test: `src/test/sidebarStateStore.test.ts`

**Steps:**
1. Add the narrow storage read needed for the sidebar state store to hydrate saved answer document content.
2. Add storage helpers that upsert `essay-answer-qN.md` project documents, pin them by default, and update project question completion metadata.
3. Reconcile updated project question arrays with persisted completion metadata so stale answers stop auto-including by default.
4. Extend state-store aggregation so each project view model carries hydrated saved-answer content keyed by question index.
5. Add deterministic storage/state-store tests for create/update flows and saved-answer hydration.

### Task 3: Rework the Projects tab question input UX

**Files:**
- Modify: `src/webview/sidebarState.ts`
- Modify: `src/webview/sidebarPageRenderers.ts`
- Modify: `src/webview/sidebarDomEvents.ts`
- Modify: `src/webview/sidebarScript.ts`
- Create: `src/webview/sidebarEssayWorkflow.ts`
- Test: `src/test/sidebarScript.test.ts`

**Steps:**
1. Introduce shared webview helpers for question-list serialization, per-question draft lookup, and status calculation.
2. Replace textarea-based question entry with repeated per-question fields plus `문항 추가` controls in both create and edit flows.
3. Serialize repeated fields back to the existing `essayQuestions: string[]` payload while dropping blank entries.
4. Keep the inline-script section layout intact by wiring the new helper section into the assembler and updating coverage expectations.

### Task 4: Rebuild the Essay tab around project-owned questions

**Files:**
- Modify: `src/webview/sidebarState.ts`
- Modify: `src/webview/sidebarMessages.ts`
- Modify: `src/webview/sidebarPageRenderers.ts`
- Modify: `src/webview/sidebarDomEvents.ts`
- Modify: `src/webview/sidebarRender.ts`
- Modify: `src/controller/handlers/runHandlers.ts`
- Create: `src/controller/handlers/essayQuestionHandlers.ts`
- Modify: `src/controller/forJobController.ts`

**Steps:**
1. Normalize run-form state around `activeQuestionIndex` and per-question drafts instead of a free-form run question.
2. Default the Essay tab to question 1 when a project has essay questions and surface navigation chips with `미작성` / `작성 중` / `완료` status.
3. Derive `runReview.question` from the selected project question and carry question-index metadata into runs and continuations.
4. Add the visible `완료` action, keep completed questions editable, and auto-advance to the next question after completion.
5. Shift user-facing copy away from `/done` so the main completion flow is the Essay-tab button.

### Task 5: Verify context inclusion and workflow regressions

**Files:**
- Modify: `src/core/contextCompiler.ts`
- Test: `src/test/contextCompiler.test.ts`
- Test: `src/test/storage.test.ts`
- Test: `src/test/webviewProtocol.test.ts`
- Test: `src/test/sidebarScript.test.ts`

**Steps:**
1. Confirm compiled context still uses the existing pinned-document architecture and therefore only auto-includes completed answers.
2. Add regression coverage for question-1 defaulting, question-scoped run requests, completion document saving, and completed-answer inclusion.
3. Run build plus deterministic tests for the touched modules, then record any intentionally deferred polish or follow-up risk.
