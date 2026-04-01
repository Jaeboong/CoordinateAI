# Status Feedback And Activity Animations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** webview에 단일 active banner, queued-count, 버튼 로딩 표시, AI thinking/writing 상태 애니메이션을 추가한다.

**Architecture:** 기존 sidebar webview state 위에 프런트엔드 전용 `bannerQueue`, `activeTurnStates`, `pendingButtons`를 추가한다. backend 이벤트는 그대로 받아서, webview 렌더링만 더 반응형으로 바꾼다.

**Tech Stack:** TypeScript, VS Code Webview HTML/CSS/JS

---

### Task 1: Banner State Model

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Add queue-aware banner state**

- Replace single `banner` variable with queue semantics
- Render one active banner plus queued-count text

**Step 2: Prefer busy state over passive banners**

- `busyMessage` stays the visible active status while work is ongoing

**Step 3: Verify build**

Run: `npm run test`
Expected: compile passes.

### Task 2: Button Loading Feedback

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Track pending action buttons**

- On click/submit, mark related button as loading immediately
- Clear loading state when new state/banner arrives and work finishes

**Step 2: Add subtle spinner styling**

- Use CSS-only loading affordance compatible with current theme

### Task 3: Thinking And Writing Activity Indicators

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Track provider activity from run events**

- `turn-started` => thinking
- `chat-message-started` or first delta => writing
- completion/failure => remove activity

**Step 2: Render activity row in Runs conversation card**

- Small animated chips like `Codex • Thinking…`
- Move to `Writing…` when streaming begins

### Task 4: Final Verification

**Files:**
- Modify: `README.md` only if user-facing behavior text needs a note

**Step 1: Run tests**

Run: `npm run test`
Expected: full suite passes

**Step 2: Manual sanity**

- Click provider actions and confirm immediate loading cue
- Start a run and confirm:
  - active banner does not stack
  - queued count appears when needed
  - conversation shows thinking/writing activity
