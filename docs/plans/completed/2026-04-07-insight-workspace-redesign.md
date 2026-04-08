# Insight Workspace Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move ForJob's pre-writing flow to a project-first experience with automatic posting analysis, a dedicated insight workspace panel, and settings moved behind a sidebar modal.

**Architecture:** Keep the existing project-scoped artifact model, but change the UX shell around it. The sidebar becomes a project launcher with a settings modal, while generated insight documents open in a dedicated main-area webview panel with tabs for company, job, strategy, and question analysis. Posting analysis should prefer URL-only input and only reveal manual posting text when automatic fetch/extraction fails.

**Tech Stack:** VS Code extension host, sidebar webview, new main-area webview panel, OpenDART REST client, existing project storage, deterministic `node:test` coverage.

**Status:** In Progress

---

### Task 1: Project Input and Failure-State Plumbing

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/storage.ts`
- Modify: `src/core/jobPosting.ts`
- Modify: `src/controller/forJobController.ts`
- Test: `src/test/storage.test.ts`
- Test: `src/test/jobPosting.test.ts`

**Step 1:** Allow project creation/update to survive URL-first input by deriving a fallback project label/slug when company name is not known yet.

**Step 2:** Add an explicit project-level flag for “manual posting fallback required” so the UI can reveal paste-in text only after automatic extraction fails.

**Step 3:** Change posting analysis to save structured extraction on success, set manual fallback on fetch/parse failure, and avoid throwing generic top-level errors for expected extraction failures.

**Step 4:** Update deterministic tests for URL fetch failure, fallback persistence, and project creation without a company name.

### Task 2: OpenDART Settings and Connection Test

**Files:**
- Modify: `src/core/openDart.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/controller/forJobController.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Modify: `src/core/viewModels.ts`
- Test: `src/test/openDart.test.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1:** Add a lightweight OpenDART connection-test method that verifies the configured key against the official API and returns a clear success/failure message.

**Step 2:** Add webview messages and controller handlers for saving, clearing, and testing the OpenDART key.

**Step 3:** Keep OpenDART configuration state in sidebar view state so the modal can display connection chips and last-known status cleanly.

**Step 4:** Add deterministic tests for the new protocol and connection-test behavior.

### Task 3: Sidebar UX Simplification and Settings Modal

**Files:**
- Modify: `src/webview/sidebarTemplate.ts`
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1:** Replace the current multi-tab shell with a project-focused header and a settings button that opens a modal.

**Step 2:** Move provider controls, OpenDART controls, and profile-context controls into modal sections instead of top-level tabs.

**Step 3:** Simplify the project form so URL and essay questions are the primary input, show extraction-review fields only after analysis succeeds, and show manual posting text only when fallback is required.

**Step 4:** Add an “Open insight workspace” action for projects with generated artifacts and update script tests to cover the new UI strings and actions.

### Task 4: Dedicated Insight Workspace Panel

**Files:**
- Create: `src/webview/insightWorkspace.ts`
- Create: `src/webview/insightWorkspaceTemplate.ts`
- Create: `src/webview/insightWorkspaceStyles.ts`
- Create: `src/webview/insightWorkspaceScript.ts`
- Modify: `src/controller/forJobController.ts`
- Modify: `src/extension.ts`
- Test: `src/test/insights.test.ts`

**Step 1:** Add a reusable webview panel controller that can open or reveal a single insight workspace per project.

**Step 2:** Load the four generated insight documents from project storage and render them in a tabbed main-area page: `기업 분석`, `직무 분석`, `지원 전략`, `문항 분석`.

**Step 3:** Automatically open/reveal the insight workspace after successful insight generation, and allow reopening it from the sidebar.

**Step 4:** Keep the panel source-aware by surfacing project metadata and document availability without fabricating missing sections.

### Task 5: Validation, Docs, and Local Install Refresh

**Files:**
- Modify: `README.md`
- Test: `src/test/*.test.ts` (targeted plus full suite)

**Step 1:** Document the new sidebar/settings/insight-workspace flow and clarify that URL analysis is automatic with manual fallback only on failure.

**Step 2:** Run TypeScript build plus targeted deterministic tests, then the full `dist/test/*.test.js` suite.

**Step 3:** Refresh the WSL-installed extension copy after build so the actual remote VS Code host loads the same UI as the repo build.

### Notes

- Risks:
  - Sidebar script is already large, so changes should reuse existing helpers instead of creating a second competing state model.
  - Project creation/update currently assumes a non-empty company name; this must be relaxed carefully to avoid breaking slug generation and existing projects.
  - The insight panel should not become a second orchestration surface; it is a viewer/workspace for pre-generated artifacts.
- Follow-up:
  - Move or redesign the essay run surface after the new insight workspace settles.
  - Add richer source/sidebar interactions inside the insight panel later if needed.
- Validation run:
  - `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
  - `./scripts/with-node.sh --test dist/test/*.test.js`
