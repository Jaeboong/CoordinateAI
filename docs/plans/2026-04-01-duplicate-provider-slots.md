# Duplicate Provider Slots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `Runs` 탭을 `Coordinator 1명 + Reviewer 1명 이상` 구조로 바꾸고, 같은 provider를 coordinator/reviewer 슬롯에 중복해서 선택할 수 있게 만든다.

**Architecture:** 저장 포맷은 기존 `coordinatorProvider + reviewerProviders[]`를 유지하고, 오케스트레이터가 실행 시 슬롯 객체를 파생해 `participantId`와 `participantLabel`로 상태를 추적한다. Webview는 체크박스 기반 선택 대신 coordinator select와 동적 reviewer row 리스트를 렌더링한다.

**Tech Stack:** TypeScript, VS Code extension webview, existing storage/protocol types, node:test

---

### Task 1: Add slot-aware participant metadata to runtime records

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`

**Step 1: Extend turn/event/chat types**

Add optional fields:
- `participantId`
- `participantLabel`

**Step 2: Keep storage backward-compatible**

Do not replace `providerId`; keep it for provider-specific styling and execution.

### Task 2: Refactor orchestrator identity handling

**Files:**
- Modify: `src/core/orchestrator.ts`

**Step 1: Derive participant slots**

Build:
- one coordinator slot
- reviewer slots from `reviewerProviders[]`

**Step 2: Execute reviewer turns by slot**

Use slot identity for:
- activity keys
- message scopes
- failure removal
- realtime status collection

**Step 3: Improve labels**

Use slot labels in:
- prompts/history blocks
- chat speaker labels
- events/messages

### Task 3: Replace provider checkbox UI with slot UI

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Add local reviewer row state**

Track selected reviewer providers as an ordered list.

**Step 2: Render coordinator + reviewers**

Replace checkbox selection with:
- coordinator select
- reviewer rows
- add reviewer button
- remove reviewer button

**Step 3: Update validation**

Require:
- coordinator selected
- reviewer count >= 1
- all selected providers healthy

### Task 4: Update conversation and activity rendering

**Files:**
- Modify: `src/webview/sidebarScript.ts`

**Step 1: Prefer participant labels**

If `participantLabel` exists, render it instead of raw provider label.

**Step 2: Keep provider-based color coding**

Continue to color names via `providerId`.

### Task 5: Add tests for duplicate-provider slots

**Files:**
- Modify: `src/test/orchestrator.test.ts`
- Modify: `src/test/sidebarScript.test.ts`
- Modify: `src/test/webviewProtocol.test.ts`

**Step 1: Add duplicate reviewer orchestrator test**

Verify duplicate `codex` reviewers:
- both execute
- prompts/scopes differ by slot
- consensus tracks both slots separately

**Step 2: Update sidebar smoke test**

Verify reviewer-row UI strings exist.

**Step 3: Keep protocol compatibility**

Confirm the existing `coordinatorProvider + reviewerProviders[]` payload still parses.

### Task 6: Verify and sync

**Files:**
- Modify: none

**Step 1: Build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`

Expected: compile succeeds

**Step 2: Run tests**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`

Expected: all tests pass

**Step 3: Sync installed extension**

Run:

```bash
rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/
cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json
```
