# Profile Document Preview Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 프로필 문서 항목을 클릭하면 웹뷰 내부 모달에서 문서의 메타데이터와 본문 미리보기를 볼 수 있게 만든다.

**Architecture:** 웹뷰에서 `openProfileDocumentPreview` 요청을 보내면, 컨트롤러가 storage에서 해당 문서와 preview content를 읽어 `profileDocumentPreview` 메시지로 다시 전달한다. 웹뷰는 local state로 preview payload를 들고 모달을 렌더하며, 배경 클릭과 `Esc`로 닫을 수 있다.

**Tech Stack:** TypeScript, VS Code webview messaging, Node.js fs, node:test

---

### Task 1: 프로토콜과 preview payload 정의

**Files:**
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/webview/sidebar.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1: Write the failing test**

`openProfileDocumentPreview` 요청과 `profileDocumentPreview` 응답 payload가 스키마를 통과하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: 새 메시지 타입이 없어서 FAIL

**Step 3: Write minimal implementation**

- request/response schema와 payload type을 추가한다.
- sidebar provider에 preview 메시지 전송 메서드를 추가한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/webviewProtocol.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/webviewProtocol.ts src/webview/sidebar.ts src/test/webviewProtocol.test.ts
git commit -m "feat: add profile document preview protocol"
```

### Task 2: storage/controller preview 로딩 추가

**Files:**
- Modify: `src/core/storage.ts`
- Modify: `src/controller/forJobController.ts`

**Step 1: Write the failing test**

profile document의 normalized content 우선, raw text fallback 규칙을 검증하는 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/storage.test.js`
Expected: profile document preview helper가 없어 FAIL

**Step 3: Write minimal implementation**

- storage에 profile document 조회 helper를 추가한다.
- preview content를 조합하는 helper를 추가한다.
- 컨트롤러 핸들러에서 preview payload를 읽어 sidebar로 전달한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/storage.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/storage.ts src/controller/forJobController.ts src/test/storage.test.ts
git commit -m "feat: load profile document previews"
```

### Task 3: 웹뷰 모달 UI 연결

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1: Write the failing test**

새 preview 메시지를 포함해도 sidebar script가 parse 가능하고, 프로필 문서 항목에 preview 액션이 렌더되는 스모크 테스트를 추가한다.

**Step 2: Run test to verify it fails**

Run: `./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: 새 state/message 경로가 없어서 FAIL

**Step 3: Write minimal implementation**

- 프로필 문서 카드 본문을 클릭 가능한 preview trigger로 바꾼다.
- preview payload 수신 시 모달을 열고, 닫기/배경 클릭/ESC 처리를 추가한다.
- 모달 레이아웃과 스크롤 스타일을 추가한다.

**Step 4: Run test to verify it passes**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/sidebarScript.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/test/sidebarScript.test.ts
git commit -m "feat: show profile document previews in modal"
```

### Task 4: Full verification

**Files:**
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/core/storage.ts`
- Modify: `src/controller/forJobController.ts`
- Modify: `src/webview/sidebar.ts`
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Run TypeScript build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
Expected: PASS

**Step 2: Run focused tests**

Run: `./scripts/with-node.sh --test dist/test/webviewProtocol.test.js dist/test/storage.test.js dist/test/sidebarScript.test.js`
Expected: PASS

**Step 3: Manual smoke-check notes**

- 프로필 문서 항목 클릭 시 모달이 열린다.
- PDF/PPTX도 normalized content가 있으면 본문이 보인다.
- 체크박스 클릭은 모달 대신 pin toggle만 동작한다.
- ESC와 배경 클릭으로 모달이 닫힌다.

**Step 4: Commit**

```bash
git add src/core/webviewProtocol.ts src/core/storage.ts src/controller/forJobController.ts src/webview/sidebar.ts src/webview/sidebarScript.ts src/webview/sidebarStyles.ts src/test/webviewProtocol.test.ts src/test/storage.test.ts src/test/sidebarScript.test.ts docs/plans/2026-04-02-profile-document-preview-modal-design.md docs/plans/2026-04-02-profile-document-preview-modal.md
git commit -m "feat: preview profile documents in modal"
```
