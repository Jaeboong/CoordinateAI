# Projects Tab Lightweight Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `Projects` 탭을 카드 여러 장이 세로로 쌓인 관리자 화면에서, `프로젝트 선택 -> 프로젝트 생성/수정 -> 공고 정보/문서 관리` 흐름이 바로 보이는 가벼운 레이아웃으로 재구성한다.

**Architecture:** 내부 데이터는 기존 `roleName`을 유지하되 화면 라벨은 `포지션`으로 바꾸고, `mainResponsibilities`와 `qualifications`를 `ProjectRecord`에 추가한다. Webview는 상단 selector toolbar, 인라인 create form, 선택된 프로젝트 편집 시트와 접힘 섹션 중심으로 재구성한다.

**Tech Stack:** TypeScript, Zod schemas, VS Code webview HTML/CSS/JS, node:test

---

### Task 1: Extend project metadata types and schemas

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`

**Step 1: Add optional project fields**

Add:
- `mainResponsibilities?: string`
- `qualifications?: string`

**Step 2: Keep backward compatibility**

Old project records without these fields must still parse cleanly.

### Task 2: Update project storage and controller flows

**Files:**
- Modify: `src/core/storage.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/controller/forJobController.ts`

**Step 1: Extend create/update payloads**

Support:
- create project with company, role, responsibilities, qualifications
- update project info with the same fields

**Step 2: Keep internal `roleName`**

Do not rename storage keys or break existing project files.

### Task 3: Rebuild Projects tab layout

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Replace the stacked card flow**

Use:
- top selector toolbar
- inline new-project toggle/form
- selected project summary header

**Step 2: Add compact project editor**

Show:
- 회사 이름
- 포지션
- 주요 업무
- 자격요건

with lighter sections instead of full card-per-section layout.

**Step 3: Keep rubric and documents accessible**

Use collapsible sections for rubric and document management so they stay available without dominating the screen.

### Task 4: Update labels and button copy

**Files:**
- Modify: `src/webview/sidebarScript.ts`

**Step 1: Rename visible labels**

Use:
- `포지션` on screen
- keep `roleName` only internally

**Step 2: Remove the redundant selected-project helper text**

Drop the explanatory sentence under the project selector.

### Task 5: Add tests

**Files:**
- Modify: `src/test/storage.test.ts`
- Modify: `src/test/webviewProtocol.test.ts`
- Modify: `src/test/sidebarScript.test.ts`

**Step 1: Storage test**

Verify project create/update persists responsibilities and qualifications.

**Step 2: Protocol test**

Verify create/update project messages accept the new fields.

**Step 3: Sidebar smoke test**

Verify new project labels and lightweight Projects tab markers are present in the generated script.

### Task 6: Verify and sync

**Files:**
- Modify: none

**Step 1: Build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`

**Step 2: Test**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`

**Step 3: Sync installed extension**

Run:

```bash
rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/
cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json
```
