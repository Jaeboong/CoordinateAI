# Realtime Ledger Reference Scoping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** realtime discussion ledger에서 자기참조 교차 피드백을 막고, 현재 섹션 blocker와 후속 과제를 분리해 토론 수렴 품질을 높인다.

**Architecture:** 오케스트레이터가 realtime round마다 `reference packet`과 `section-scoped ledger`를 만든다. reviewer prompt는 코디네이터와 타 reviewer reference만 받도록 바뀌고, ledger는 `Open Challenges`와 `Deferred Challenges`를 분리한다. notion placeholder request는 explicit request로 취급하지 않도록 정리한다.

**Tech Stack:** TypeScript, Zod, node:test, VS Code webview

---

### Task 1: section-scoped ledger 타입과 artifact shape 확장

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1: Write the failing test**

`discussion-ledger.md` artifact와 event payload가 `Deferred Challenges`를 담을 수 있도록 schema test를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: FAIL because `deferredChallenges` is missing from the schema.

**Step 3: Write minimal implementation**

- `DiscussionLedger` 타입에 `deferredChallenges`를 추가한다.
- schema와 view model artifact flag parsing을 확장한다.
- recent runs artifact flag path는 그대로 유지한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/schemas.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/test/webviewProtocol.test.ts
git commit -m "feat: extend realtime ledger with deferred challenges"
```

### Task 2: reviewer reference packet 생성과 자기참조 제거

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

다음 조건을 검증하는 테스트를 추가한다.

- reviewer prompt에 coordinator reference가 포함된다.
- reviewer prompt에 타 reviewer reference가 포함된다.
- reviewer prompt에 자기 자신의 reviewer reference는 포함되지 않는다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: FAIL because current prompt only has freeform summary.

**Step 3: Write minimal implementation**

- `buildPreviousRoundReviewerSummary` 대신 reference packet helper를 만든다.
- coordinator reference와 reviewer references를 만든다.
- current reviewer의 `participantId`와 같은 reviewer ref는 제외한다.
- reviewer prompt의 `Cross-feedback` 규칙을 `[refId] agree|disagree` 형식으로 바꾼다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: add scoped realtime reference packets"
```

### Task 3: open challenges와 deferred challenges 분리

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

아래 시나리오를 검증하는 테스트를 추가한다.

- `Target Section` 밖 이슈가 `Deferred Challenges`로 이동한다.
- `Open Challenges`가 비면 현재 섹션은 수렴 가능한 상태가 된다.
- `Deferred Challenges`가 남아 있으면 final draft는 아직 생성되지 않는다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: FAIL because current code treats every open challenge as a blocker.

**Step 3: Write minimal implementation**

- coordinator prompt에 `Deferred Challenges` 규칙을 추가한다.
- ledger parser와 artifact renderer에 `Deferred Challenges`를 넣는다.
- finalization 조건을 `openChallenges.length === 0 && deferredChallenges.length === 0`로 조정한다.
- current section consensus와 whole-document finalization을 분리한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: scope realtime blockers by target section"
```

### Task 4: notion placeholder request 정리

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

`notionRequest`가 `"."` 또는 구두점 placeholder일 때:

- explicit user request처럼 기록되지 않고
- awkward resolution phrasing가 prompt/record에 남지 않는지 검증하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: FAIL because placeholder strings are currently treated as normal requests.

**Step 3: Write minimal implementation**

- placeholder-only notion request 판별 helper를 추가한다.
- explicit request가 아니면 pre-pass를 스킵하거나 auto context label로 전환한다.
- continuation note implicit notion detection과 충돌하지 않게 정리한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "fix: ignore placeholder notion requests in realtime flow"
```

### Task 5: live ledger artifact and UI follow-up

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1: Write the failing test**

Conversation 카드 또는 ledger artifact가 `Deferred Challenges`까지 반영할 수 있는지 확인하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: FAIL because current UI only knows the older ledger shape.

**Step 3: Write minimal implementation**

- live ledger rendering이 `Deferred Challenges`를 무시하지 않도록 조정한다.
- 필요하면 작은 secondary list로 후속 과제를 노출한다.
- recent runs의 `토론 상태 열기`는 그대로 유지한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/test/sidebarScript.test.ts
git commit -m "feat: show scoped realtime ledger follow-up state"
```

### Task 6: Full verification and WSL sync

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Run TypeScript build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
Expected: PASS

**Step 2: Run full test suite**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`
Expected: PASS

**Step 3: Sync to installed WSL extension**

Run:

```bash
rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/
cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json
```

Expected: installed WSL extension reflects the latest runtime files.

**Step 4: Manual smoke-check notes**

- reviewer prompt logs do not show self-reference targets.
- `Cross-feedback` references coordinator or another reviewer only.
- current section blocker and deferred follow-up tasks are visibly separated.
- `discussion-ledger.md` shows `Deferred Challenges`.

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/core/types.ts src/core/schemas.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/test/orchestrator.test.ts src/test/webviewProtocol.test.ts src/test/sidebarScript.test.ts docs/plans/2026-04-02-realtime-ledger-reference-scoping-design.md docs/plans/2026-04-02-realtime-ledger-reference-scoping.md
git commit -m "feat: scope realtime ledger references and blockers"
```
