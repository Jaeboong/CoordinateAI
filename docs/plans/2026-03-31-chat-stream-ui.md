# Chat Stream UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split run output into a readable chat-style stream with live AI natural-language deltas while keeping raw system events in a separate panel.

**Architecture:** Extend the runtime event model so provider stdout is normalized into two streams: user-facing chat messages and low-level system events. Keep orchestration flow intact, but persist chat messages alongside existing artifacts so the sidebar can render a conversation view and a smaller debug stream at the same time.

**Tech Stack:** TypeScript, VS Code Webview UI, local CLI process streaming, node:test

---

### Task 1: Define chat event types and persisted message model

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`

**Steps:**
1. Add chat message and chat event interfaces for message start, delta, and completion.
2. Extend the run event union to include chat event variants without breaking current system events.
3. Add schema coverage for any persisted chat message records that will be written to disk.

### Task 2: Normalize provider output into chat and system streams

**Files:**
- Modify: `src/core/providers.ts`
- Create: `src/core/providerStreaming.ts`
- Test: `src/test/providerStreaming.test.ts`

**Steps:**
1. Extract provider-specific stdout parsing into a dedicated streaming helper.
2. Convert Codex JSON events and plain-text provider output into normalized chat delta events plus system events.
3. Keep raw stderr/stdout available as system events for the debug panel.
4. Add tests for Codex event parsing and a plain-text fallback path.

### Task 3: Persist chat messages during runs

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/storage.ts`
- Modify: `src/core/viewModels.ts`
- Test: `src/test/orchestrator.test.ts`

**Steps:**
1. Collect normalized chat events while a run is in progress.
2. Persist chat messages to a run artifact such as `chat-messages.json`.
3. Expose recent run chat availability in the sidebar view model.
4. Add an orchestrator test that verifies chat events are emitted and saved.

### Task 4: Redesign the Runs panel

**Files:**
- Modify: `src/webview/sidebar.ts`
- Modify: `src/extension.ts`

**Steps:**
1. Replace the single raw log box with a main chat transcript panel.
2. Render streaming AI messages by provider, role, and timestamp.
3. Move the existing raw event log into a smaller, separately labeled system stream panel.
4. Keep current run controls and recent run artifact buttons intact.

### Task 5: Document and verify

**Files:**
- Modify: `README.md`
- Test: `src/test/providers.test.ts`

**Steps:**
1. Document the new run UI behavior and the distinction between chat stream and system stream.
2. Add any remaining regression tests for runtime event splitting.
3. Run `npm run test` and confirm the full suite passes.
