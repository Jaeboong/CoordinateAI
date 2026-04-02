# Collapsible Panel State Preservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 설정/컨텍스트 편집 후에도 열어 둔 섹션과 현재 스크롤 위치를 유지하고, 접힘 UI에 빠른 애니메이션을 추가한다.

**Architecture:** 웹뷰 persisted state에 탭별 스크롤 위치와 collapsible open state를 저장한다. `details` 기반 접힘 UI를 상태 기반 markup으로 바꾸고 CSS transition으로 빠른 열림/닫힘 애니메이션을 준다.

**Tech Stack:** TypeScript, VS Code webview HTML/CSS/JS, node:test

---

### Task 1: Persist collapsible and scroll UI state

**Files:**
- Modify: `src/webview/sidebarScript.ts`

**Step 1: Add persisted UI state**

Persist:
- 탭별 스크롤 위치
- 프로젝트 섹션 open state
- 실행 설정 open state
- 새 프로젝트 패널 open state

**Step 2: Restore scroll after render**

Render 직후 현재 탭의 저장된 스크롤 값을 복원한다.

### Task 2: Replace default collapsible markup

**Files:**
- Modify: `src/webview/sidebarScript.ts`

**Step 1: Render state-driven collapsible sections**

Replace:
- `run-setup-details`
- `project-fold`

with explicit open/closed classes and toggle buttons.

**Step 2: Keep copy and status chips intact**

Existing summary text, chips, labels, and actions must keep working.

### Task 3: Add fast collapse/expand animations

**Files:**
- Modify: `src/webview/sidebarStyles.ts`

**Step 1: Add reusable collapsible styles**

Animate:
- panel height via grid rows
- opacity
- subtle Y offset
- chevron rotation

**Step 2: Apply styles to project and run panels**

Keep current visual language and spacing while making transitions noticeable.

### Task 4: Add regression coverage and verify

**Files:**
- Modify: `src/test/sidebarScript.test.ts`

**Step 1: Extend sidebar smoke assertions**

Assert generated script includes:
- collapsible toggle action
- stored fold state variables
- stored scroll position variables

**Step 2: Build and test**

Run:
- `npm test`
