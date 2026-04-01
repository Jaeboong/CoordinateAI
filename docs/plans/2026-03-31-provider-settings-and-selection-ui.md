# Provider Settings And Selection UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provider별 `model`/`effort` 설정을 추가하고, 세로 체크박스 기반 선택 UI를 가로형 카드/토글 UI로 정리한다.

**Architecture:** VS Code workspace configuration을 provider 설정의 저장소로 사용하고, `ProviderRegistry`가 실행 시 설정을 읽어 CLI 인자로 변환한다. Webview는 provider capability metadata를 받아 provider 카드와 selection grid를 렌더링한다.

**Tech Stack:** TypeScript, VS Code extension API, existing webview HTML/CSS/JS, node:test

---

### Task 1: Add provider settings metadata to core types

**Files:**
- Modify: `src/core/types.ts`

**Step 1: Add provider settings/capability types**

Add lightweight interfaces for provider option metadata and runtime settings display.

**Step 2: Extend `ProviderRuntimeState`**

Include:
- configured model
- configured effort
- model options
- effort options
- capability booleans

**Step 3: Verify compile mentally before moving on**

The rest of the code should still compile after importing the new types.

### Task 2: Add workspace configuration keys

**Files:**
- Modify: `package.json`

**Step 1: Add model config keys for all three providers**

Add string properties with empty-string default.

**Step 2: Add effort config keys for Codex and Claude**

Do not add Gemini effort because it is not exposed in the current CLI.

### Task 3: Implement provider capability metadata and settings access

**Files:**
- Modify: `src/core/providers.ts`

**Step 1: Add static provider option presets**

Curate a small recommended list per provider plus `custom`.

**Step 2: Add getter/setter helpers**

Implement:
- `getModel`
- `setModel`
- `getEffort`
- `setEffort`

**Step 3: Return settings in `listRuntimeStates()`**

Include configured values and capability metadata.

### Task 4: Pass provider settings into CLI execution

**Files:**
- Modify: `src/core/providers.ts`
- Test: `src/test/providers.test.ts` or existing relevant test file

**Step 1: Update `buildArgs()`**

Apply provider-specific flags:
- Codex model + config effort
- Claude model + effort
- Gemini model

**Step 2: Add tests for generated args**

Cover:
- Codex with model + effort
- Claude with model + effort
- Gemini with model only

### Task 5: Wire webview messages for provider settings

**Files:**
- Modify: `src/extension.ts`

**Step 1: Add new message handlers**

Handle:
- `setProviderModel`
- `setProviderEffort`

**Step 2: Persist workspace config**

Use `ProviderRegistry` setters and refresh state after saving.

### Task 6: Rework Providers tab UI

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Add provider settings controls**

Render:
- `Model` dropdown
- `Custom model` input when needed
- `Effort` dropdown or disabled notice

**Step 2: Make layout denser**

Use two-column grids where helpful so provider cards do not feel too tall.

### Task 7: Convert run selections to horizontal cards

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Add reusable selection-card CSS**

Introduce a grid layout and card styling for checkbox-backed options.

**Step 2: Apply it to provider selection**

Show provider id + health in compact selectable cards.

**Step 3: Apply it to additional documents**

Show title + scope in compact selectable cards.

### Task 8: Convert pin controls to horizontal toggles

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Update pasted text forms**

Make `Pin by default` inline instead of stacked.

**Step 2: Update document cards**

Replace the vertical checkbox label with a compact toggle row or chip.

### Task 9: Update docs and verify

**Files:**
- Modify: `README.md`

**Step 1: Document provider settings**

Explain model/effort behavior and provider differences.

**Step 2: Run tests**

Run: `npm run test`

Expected: all tests pass
