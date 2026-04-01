# Project Detail Management And Runs Project Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Projects 탭을 선택 기반 상세 관리 화면으로 바꾸고, Runs 탭에서 프로젝트를 직접 선택하며, 프로젝트와 프로젝트 문서를 수정/삭제할 수 있게 만든다.

**Architecture:** 저장 계층에 프로젝트 및 프로젝트 문서 수정/삭제 API를 추가하고, extension controller가 편집 프리셋 로드/삭제 확인을 담당한다. webview는 `selectedProjectSlug`를 중심으로 Projects 상세 화면과 Runs 프로젝트 picker를 재구성한다.

**Tech Stack:** TypeScript, VS Code Webview API, local JSON/file storage, node:test

---

### Task 1: Storage APIs For Project And Project Documents

**Files:**
- Modify: `src/core/storage.ts`
- Test: `src/test/storage.test.ts`

**Step 1: Write the failing tests**

- Add tests for:
  - project info update
  - project deletion
  - text project document update
  - project document deletion

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: storage-related assertions fail because the APIs do not exist yet.

**Step 3: Write minimal implementation**

- Add storage methods for:
  - updating project info without changing slug
  - deleting project directory recursively
  - loading a project document by id
  - updating project document metadata/content
  - deleting project document and cleaning manifest + pinned ids

**Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: new storage tests pass.

### Task 2: Extension Controller Messages

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/webview/sidebar.ts`

**Step 1: Add failing interactions mentally from current UI flow**

- Need handlers for:
  - update project info
  - delete project
  - load project document editor preset
  - update project document
  - delete project document
  - set selected project from runs/projects UI

**Step 2: Implement controller support**

- Add message handlers and confirmation dialogs
- Add webview post method for document editor preset

**Step 3: Verify wiring manually through types/build**

Run: `npm run test`
Expected: compile succeeds and controller builds.

### Task 3: Projects Tab Rework

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Rebuild Projects layout**

- Keep create-project form
- Add selected-project picker card
- Add selected-project detail sections:
  - project info edit/delete
  - rubric
  - add/edit text context
  - import files
  - project documents list with edit/delete/pin

**Step 2: Add document editor preset flow**

- Reuse the text form for create/edit
- Support metadata-only edit for non-text docs

**Step 3: Run tests/build**

Run: `npm run test`
Expected: all tests still pass.

### Task 4: Runs Project Picker

**Files:**
- Modify: `src/webview/sidebar.ts`
- Modify: `README.md`

**Step 1: Add project dropdown to Runs**

- The selected project drives heading, docs, recent runs, and run submission slug.

**Step 2: Update docs**

- Explain that project selection is now possible directly inside Runs.
- Explain project detail editing/deletion in Projects.

**Step 3: Final verification**

Run: `npm run test`
Expected: full suite passes.
