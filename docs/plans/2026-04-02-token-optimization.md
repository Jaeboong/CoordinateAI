# Prompt Token Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ForJob의 토큰 사용량을 줄이기 위해 Notion pre-pass와 realtime prompt 입력을 역할별 예산 구조로 재설계하고, prompt metrics를 남겨 실제 절감 효과를 검증한다.

**Architecture:** `ContextCompiler`에 `full / compact / minimal` profile을 추가하고, `ReviewOrchestrator`는 role/mode별로 다른 context profile을 사용한다. `notionRequest`는 punctuation-only 값을 비우고, Notion pre-pass는 explicit request가 있을 때만 최소 컨텍스트로 수행한다. realtime reviewer는 전체 문맥 대신 `target section + mini draft + ledger + compact context`만 받고, prompt metrics는 artifact/event로 저장한다.

**Tech Stack:** TypeScript, Zod, VS Code webview messaging, node:test

---

### Task 1: notion request 정규화와 pre-pass gating 추가

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

다음 케이스를 검증하는 테스트를 추가한다.

- `notionRequest: "."` 또는 whitespace-only면 explicit request로 취급하지 않는다.
- explicit request와 `project.notionPageIds`가 모두 없으면 Notion pre-pass를 아예 실행하지 않는다.
- explicit request가 있으면 pre-pass는 계속 실행된다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: punctuation-only notion request가 그대로 실행되어 FAIL

**Step 3: Write minimal implementation**

- `normalizeNotionRequest()` helper를 추가한다.
- punctuation-only 문자열은 `undefined`로 정규화한다.
- `effectiveNotionRequest` 계산을 업데이트한다.
- auto notion request를 사용할지 여부를 explicit하게 제어한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "fix: gate notion pre-pass on meaningful requests"
```

### Task 2: context compiler profile 도입

**Files:**
- Modify: `src/core/contextCompiler.ts`
- Modify: `src/core/types.ts`
- Test: `src/test/contextCompiler.test.ts`

**Step 1: Write the failing test**

다음 profile 동작을 검증하는 테스트를 추가한다.

- `full`은 기존처럼 full draft + full normalized content 포함
- `compact`는 문서 content를 짧은 excerpt/digest로 제한
- `minimal`은 full document sections 없이 핵심 project/question/draft excerpt만 포함

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/contextCompiler.test.js`
Expected: compile profile 개념이 없어 FAIL

**Step 3: Write minimal implementation**

- `CompileContextProfile` 타입을 추가한다.
- `compile()` 요청에 profile을 받게 한다.
- `renderDocumentSection()`에 content cap / digest 규칙을 추가한다.
- `draft`도 profile에 따라 full 또는 excerpt로 렌더한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/contextCompiler.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/contextCompiler.ts src/core/types.ts src/test/contextCompiler.test.ts
git commit -m "feat: add context compile profiles"
```

### Task 3: role별 prompt budget 연결

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

다음 사항을 검증하는 테스트를 추가한다.

- realtime reviewer prompt에는 full project/profile document 본문이 더 이상 들어가지 않는다.
- realtime reviewer prompt에는 `Mini Draft`, `Open Challenges`, `Previous Round Reviewer Summary`는 유지된다.
- Notion pre-pass prompt는 minimal context만 사용한다.
- realtime coordinator prompt는 compact context를 사용한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: 현재는 모두 큰 compiled context를 써서 FAIL

**Step 3: Write minimal implementation**

- `buildCompiledContextMarkdown()`이 profile을 받도록 바꾼다.
- Notion pre-pass, realtime coordinator, realtime reviewer, deep feedback, final draft별 profile 매핑을 넣는다.
- realtime reviewer는 `full draft` 대신 target section 중심 excerpt를 쓰게 한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: apply role-based prompt budgets"
```

### Task 4: history와 notion brief 압축

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

다음 압축 규칙을 검증하는 테스트를 추가한다.

- realtime `Recent Discussion`은 최근 2~3개 turn 이하로 줄어든다.
- reviewer prompt는 `Previous Round Reviewer Summary`와 ledger를 우선 사용한다.
- notion brief는 compact profile에서 길이 제한 또는 핵심 bullet summary로 전달된다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: 현재 history/notion brief가 길게 유지되어 FAIL

**Step 3: Write minimal implementation**

- `buildRealtimeDiscussionHistory()`를 축소한다.
- compact/minimal notion brief helper를 추가한다.
- deep feedback는 일단 유지하고 realtime path 위주로 적용한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: compress realtime history and notion brief"
```

### Task 5: prompt metrics 기록 추가

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Test: `src/test/orchestrator.test.ts`
- Test: `src/test/sidebarStateStore.test.ts`

**Step 1: Write the failing test**

turn별 prompt metrics가 event 또는 artifact로 저장되는지 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/orchestrator.test.js dist/test/sidebarStateStore.test.js`
Expected: metrics 구조가 없어 FAIL

**Step 3: Write minimal implementation**

- `PromptMetrics` 타입과 schema를 추가한다.
- turn 시작 전에 `promptChars`, `estimatedPromptTokens`, `contextChars`, `historyChars`, `notionBriefChars`, `ledgerChars`를 계산한다.
- `prompt-metrics.json` artifact 또는 별도 run event로 저장한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js dist/test/sidebarStateStore.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/schemas.ts src/core/orchestrator.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/test/orchestrator.test.ts src/test/sidebarStateStore.test.ts
git commit -m "feat: record prompt budget metrics"
```

### Task 6: Full verification and extension sync

**Files:**
- Modify: `src/core/contextCompiler.ts`
- Modify: `src/core/orchestrator.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/viewModels.ts`
- Modify: `src/controller/sidebarStateStore.ts`

**Step 1: Run TypeScript build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
Expected: PASS

**Step 2: Run full test suite**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`
Expected: PASS

**Step 3: Sync to installed WSL extension**

Run: `rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/ && cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json`
Expected: 실제 실행본 반영 완료

**Step 4: Manual smoke-check notes**

- `notionRequest`가 `.`일 때 불필요한 pre-pass가 돌지 않는다.
- realtime reviewer prompt가 이전보다 훨씬 짧고, mini draft와 ledger 중심으로 동작한다.
- system stream 또는 artifact에서 prompt budget metrics를 확인할 수 있다.
- 실제 WSL 확장 실행본에 최신 변경이 반영된다.

**Step 5: Commit**

```bash
git add src/core/contextCompiler.ts src/core/orchestrator.ts src/core/types.ts src/core/schemas.ts src/core/viewModels.ts src/controller/sidebarStateStore.ts src/test/contextCompiler.test.ts src/test/orchestrator.test.ts src/test/sidebarStateStore.test.ts docs/plans/2026-04-02-token-optimization-design.md docs/plans/2026-04-02-token-optimization.md
git commit -m "feat: optimize prompt token budgets"
```
