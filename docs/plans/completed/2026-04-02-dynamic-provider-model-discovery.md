# Dynamic Provider Model Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Claude와 Gemini의 설치된 CLI 정보에서 명시적 모델 목록을 동적으로 찾아 AI 모델 탭에 보여주고, 가능하면 고정 모델 ID를 설정에 저장하도록 만든다.

**Architecture:** `src/core/providerOptions.ts`에 provider별 fallback 목록과 discovery parser를 함께 두고, `ProviderRegistry`가 런타임 상태 생성 시 비동기적으로 capabilities를 계산해 웹뷰로 전달한다. discovery 실패 시에는 기존 하드코딩 목록으로 안전하게 되돌아가며, 기존 alias 기반 설정도 계속 실행 가능하게 유지한다.

**Tech Stack:** TypeScript, VS Code extension runtime, Node.js fs/path utilities, node:test

---

### Task 1: Capability Discovery API 만들기

**Files:**
- Modify: `src/core/providerOptions.ts`
- Modify: `src/core/providers.ts`
- Test: `src/test/providerOptions.test.ts`

**Step 1: Write the failing test**

`getProviderCapabilities("claude")` fallback은 유지되고, 새 비동기 discovery API가 explicit 모델 목록을 반환할 수 있는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/providerOptions.test.js`
Expected: 새 discovery 함수가 없거나 기대 모델 목록을 만들지 못해 FAIL

**Step 3: Write minimal implementation**

- 정적 fallback map을 유지한다.
- provider ID와 command를 받아 capabilities를 계산하는 비동기 함수를 추가한다.
- `ProviderRegistry.buildRuntimeState()`와 `testProvider()`가 그 함수를 사용하도록 바꾼다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/providerOptions.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/providerOptions.ts src/core/providers.ts src/test/providerOptions.test.ts
git commit -m "feat: discover provider model options dynamically"
```

### Task 2: Claude/Gemini parser 추가하기

**Files:**
- Modify: `src/core/providerOptions.ts`
- Test: `src/test/providerOptions.test.ts`

**Step 1: Write the failing test**

- Claude binary string에서 `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-opus-4-6`을 찾아 정렬/라벨링하는 테스트를 추가한다.
- Gemini models config 문자열에서 허용 모델만 추출하고 내부 전용 값은 제외하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/providerOptions.test.js`
Expected: parser helper가 없거나 정렬/필터링이 틀려 FAIL

**Step 3: Write minimal implementation**

- Claude용 정규식 parser와 버전 라벨 formatter를 구현한다.
- Gemini config parser를 구현하고 preview/auto/default 모델 값을 추출한다.
- `기본값`, `직접 입력...` 옵션을 공통 후처리에서 합친다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/providerOptions.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/providerOptions.ts src/test/providerOptions.test.ts
git commit -m "feat: parse claude and gemini model catalogs"
```

### Task 3: Custom model 판정과 런타임 회귀 방지

**Files:**
- Modify: `src/core/providerOptions.ts`
- Modify: `src/test/providerOptions.test.ts`
- Modify: `src/test/providers.test.ts`

**Step 1: Write the failing test**

- explicit Claude 모델 ID가 custom으로 오인되지 않는 테스트를 추가한다.
- `ProviderRegistry`가 discovery 결과를 runtime state에 담아 반환하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/providerOptions.test.js dist/test/providers.test.js`
Expected: runtime state 또는 custom 판정이 기대와 달라 FAIL

**Step 3: Write minimal implementation**

- `isCustomModelSelection`이 정적 fallback만 보지 않고 현재 capabilities 집합을 기준으로 판단할 수 있게 조정한다.
- 테스트에서 discovery 경로를 주입하거나 helper를 직접 검증해 런타임 회귀를 막는다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/providerOptions.test.js dist/test/providers.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/providerOptions.ts src/test/providerOptions.test.ts src/test/providers.test.ts
git commit -m "test: cover dynamic provider model discovery"
```

### Task 4: Full verification

**Files:**
- Modify: `src/core/providerOptions.ts`
- Modify: `src/core/providers.ts`
- Modify: `src/test/providerOptions.test.ts`
- Modify: `src/test/providers.test.ts`

**Step 1: Run focused verification**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
Expected: PASS

**Step 2: Run tests**

Run: `./scripts/with-node.sh --test dist/test/providerOptions.test.js dist/test/providers.test.js dist/test/orchestrator.test.js dist/test/sidebarScript.test.js`
Expected: PASS

**Step 3: Manual smoke-check notes**

- Claude installed 환경에서 모델 목록에 `Sonnet 4.6`, `Sonnet 4.5`, `Opus 4.6` 형태가 노출되는지 확인한다.
- 기존 `sonnet` 설정이 남아 있어도 실행 인자가 그대로 구성되는지 확인한다.

**Step 4: Commit**

```bash
git add src/core/providerOptions.ts src/core/providers.ts src/test/providerOptions.test.ts src/test/providers.test.ts docs/plans/2026-04-02-dynamic-provider-model-discovery-design.md docs/plans/2026-04-02-dynamic-provider-model-discovery.md
git commit -m "feat: show explicit provider model versions"
```
