# Realtime Discussion Ledger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `실시간 대화형` 토론을 추상 피드백 반복이 아니라 `코디네이터 미니 초안 + 누적 ledger + reviewer 교차 피드백` 구조로 수렴시키고, 그 토론 상태를 artifact와 UI에 함께 노출한다.

**Architecture:** 오케스트레이터가 realtime run 동안 `discussion ledger`를 메모리에서 관리하면서, 코디네이터 턴마다 `Current Focus`, `Mini Draft`, `Accepted Decisions`, `Open Challenges`를 갱신한다. reviewer prompt는 이 ledger와 직전 라운드 discussion history를 바탕으로 교차 피드백을 하도록 바뀌고, 최종적으로 `discussion-ledger.md`를 저장하며 webview는 live ledger 요약과 recent run artifact 버튼을 렌더한다.

**Tech Stack:** TypeScript, VS Code webview messaging, Zod schemas, node:test

---

### Task 1: discussion ledger 타입과 run artifact 플래그 추가

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1: Write the failing test**

`discussion-ledger.md` artifact flag와 live ledger payload를 담을 수 있는 스키마/뷰모델 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: 새 artifact flag 또는 ledger schema가 없어서 FAIL

**Step 3: Write minimal implementation**

- `DiscussionLedger` 타입과 schema를 추가한다.
- run preview artifact flags에 `discussionLedger`를 추가한다.
- 필요하면 live ledger를 webview에 전달할 payload schema를 추가한다.
- `SidebarStateStore`가 `discussion-ledger.md` 존재 여부를 읽도록 확장한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/schemas.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/test/webviewProtocol.test.ts
git commit -m "feat: add discussion ledger types and artifact flags"
```

### Task 2: realtime ledger 생성 및 저장 추가

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

realtime run에서 코디네이터가 만든 `Mini Draft`/`Open Challenges`가 후속 reviewer prompt에 포함되고, 완료/중단 시 `discussion-ledger.md`가 저장되는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: ledger artifact와 prompt block이 없어 FAIL

**Step 3: Write minimal implementation**

- realtime loop 안에 `discussion ledger` 상태를 추가한다.
- 코디네이터 prompt builder가 ledger를 읽고, 코디네이터 응답에서 다음 ledger를 파생시키는 helper를 구현한다.
- run 종료 전 `discussion-ledger.md`를 저장한다.
- current draft, consensus 판단, safety stop 로직은 기존 구조를 유지한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: persist realtime discussion ledger"
```

### Task 3: 코디네이터 미니 초안과 reviewer 교차 피드백 프롬프트로 개편

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

realtime reviewer prompt가 아래를 포함하는 테스트를 추가한다.
- `Current Focus`
- `Mini Draft`
- `Accepted Decisions`
- `Open Challenges`
- `직전 라운드 reviewer 의견 1개에 반응` 규칙

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: 새 프롬프트 문구가 없어 FAIL

**Step 3: Write minimal implementation**

- 코디네이터 discussion/redirect/final prompt를 ledger 중심으로 재구성한다.
- reviewer prompt를 `코디네이터 미니 초안 평가 + 직전 라운드 objection 교차 피드백 + Status` 구조로 바꾼다.
- 같은 라운드 reviewer blind rule은 유지하되, 직전 라운드 요약은 보이게 한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: add mini draft and cross-feedback prompts"
```

### Task 4: live ledger UI와 recent run artifact 버튼 연결

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/webview/sidebar.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1: Write the failing test**

Conversation 카드에서 live ledger 요약 박스가 렌더되고, recent run 항목에 `토론 상태 열기` 버튼이 보이는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: 새 ledger UI가 없어 FAIL

**Step 3: Write minimal implementation**

- Conversation 카드 상단 또는 activity 아래에 `현재 초점 / 미니 초안 / 남은 쟁점` 요약 블록을 추가한다.
- live ledger는 `runEvent` 또는 state payload 경로로 webview local state에 반영한다.
- recent runs artifact actions에 `discussion-ledger.md` 열기 버튼을 추가한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/core/webviewProtocol.ts src/webview/sidebar.ts src/test/sidebarScript.test.ts
git commit -m "feat: show realtime discussion ledger in ui"
```

### Task 5: Full verification and extension sync

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/webview/sidebar.ts`
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Run TypeScript build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
Expected: PASS

**Step 2: Run full test suite**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`
Expected: PASS

**Step 3: Sync to installed WSL extension**

Run: `rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/ && cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json`
Expected: 최신 실행본 반영 완료

**Step 4: Manual smoke-check notes**

- 실시간 모드에서 코디네이터가 `미니 초안`을 제시한다.
- 리뷰어 응답이 단순 추상 피드백이 아니라 미니 초안 수정 의견으로 수렴한다.
- 동일 쟁점이 반복되면 `Open Challenges`에 남고, 해결되면 `Accepted Decisions`로 이동한다.
- recent run에서 `토론 상태 열기` 버튼으로 `discussion-ledger.md`를 볼 수 있다.

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/core/types.ts src/core/schemas.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/core/webviewProtocol.ts src/webview/sidebar.ts src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/test/orchestrator.test.ts src/test/webviewProtocol.test.ts src/test/sidebarScript.test.ts docs/plans/2026-04-02-realtime-discussion-ledger-design.md docs/plans/2026-04-02-realtime-discussion-ledger.md
git commit -m "feat: add realtime discussion ledger workflow"
```
