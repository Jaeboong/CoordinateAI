# Session Cycles Without Rounds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `Runs`를 라운드 수 기반 실행에서 세션형 cycle 실행으로 바꾸고, `Final synthesis` 없이 매 cycle마다 현재 결과물을 갱신하도록 만든다.

**Architecture:** 오케스트레이터는 `reviewers -> coordinator -> pause`를 반복하는 loop로 동작한다. UI는 rounds 입력을 제거하고 pause 입력창만 유지하며, `/done`으로 세션을 종료한다.

**Tech Stack:** TypeScript, VS Code extension API, existing webview HTML/CSS/JS, node:test

---

### Task 1: Rework orchestrator loop into session cycles

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: Separate one-cycle execution from run-finalization**

Build a loop that can run multiple cycles and save artifacts after each coordinator response.

**Step 2: Reuse latest revised draft as next cycle draft**

Refresh compiled context each cycle with the updated draft.

**Step 3: Keep non-interactive runs deterministic**

When no intervention callback exists, continue to honor `request.rounds`.

### Task 2: Add interactive stop/continue semantics

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: Change pause prompt copy**

Explain:
- Enter to continue
- write a note to steer the next cycle
- `/done` to stop

**Step 2: Handle `/done` as graceful completion**

Stop the loop and keep the latest artifacts.

### Task 3: Update prompt builders for cycle-based review

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: Add session snapshot blocks**

Provide current summary / improvement plan / revised draft to reviewers and coordinator.

**Step 2: Feed user guidance into later cycles**

Carry user notes into subsequent prompts instead of a one-time final synthesis prompt.

### Task 4: Remove rounds input from Runs UI

**Files:**
- Modify: `src/webview/sidebar.ts`
- Modify: `src/extension.ts`

**Step 1: Remove visible rounds field**

Do not ask users for rounds in the form.

**Step 2: Submit a default internal rounds value**

Keep `rounds: 1` or equivalent for compatibility.

**Step 3: Update pause copy**

Reflect session semantics and `/done`.

### Task 5: Update run metadata display

**Files:**
- Modify: `src/webview/sidebar.ts`
- Modify: `README.md`

**Step 1: Show completed cycle count**

Replace `N rounds` wording with `N cycles`.

**Step 2: Document session behavior**

Explain no rounds input, Enter to continue, `/done` to stop.

### Task 6: Update orchestrator tests

**Files:**
- Modify: `src/test/orchestrator.test.ts`

**Step 1: Update pause tests for `/done`**

Interactive tests should stop explicitly.

**Step 2: Add multi-cycle interactive test**

Verify one blank continuation leads to another cycle and `/done` stops after artifacts are refreshed.

### Task 7: Verify

**Files:**
- Modify as needed from previous tasks

**Step 1: Run tests**

Run: `npm run test`

Expected: all tests pass
