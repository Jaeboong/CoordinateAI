# Insight Pre-Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a project-scoped insight generation pre-pass that extracts a posting, enriches company information with OpenDART, generates reusable insight artifacts, and feeds them into existing essay runs automatically.

**Architecture:** Extend the current project metadata and project document model instead of building a parallel subsystem. Use a dedicated insight service pipeline for posting extraction, reviewed structured inputs, OpenDART enrichment, and provider-backed artifact generation, then pin the generated insight documents by default so the existing context compiler can consume them.

**Tech Stack:** TypeScript, VS Code extension host, existing webview UI, node:test, local JSON/Markdown storage under `.forjob`, official OpenDART REST APIs, deterministic fixtures/mocks

**Status:** In Progress

---

### Task 1: Extend project state and protocol for insight inputs and reviewed extraction

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/core/webviewProtocol.ts`
- Modify: `src/core/storage.ts`
- Test: `src/test/storage.test.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1:** Add project metadata for posting URL, essay questions, reviewed extraction, DART match info, and insight status.

**Step 2:** Update schemas and protocol messages so the webview can create/update projects and request insight actions with the new fields.

**Step 3:** Persist the new project metadata safely with backward-compatible parsing.

**Step 4:** Add tests covering project creation/update and protocol parsing with the new fields.

### Task 2: Add deterministic posting extraction pipeline

**Files:**
- Create: `src/core/jobPosting.ts`
- Modify: `src/controller/forJobController.ts`
- Test: `src/test/jobPosting.test.ts`

**Step 1:** Implement HTML fetch/normalization and manual text fallback support.

**Step 2:** Implement structured extraction candidates for company, role, responsibilities, qualifications, preferred qualifications, and keywords.

**Step 3:** Wire a controller action that can analyze a posting and return editable reviewed fields to the webview.

**Step 4:** Add fixture-driven tests for extraction normalization and failure fallback.

### Task 3: Add OpenDART client, caching, and secret storage support

**Files:**
- Create: `src/core/openDart.ts`
- Modify: `src/controller/forJobController.ts`
- Modify: `src/webview/sidebarScript.ts`
- Test: `src/test/openDart.test.ts`

**Step 1:** Implement a small OpenDART client for corp code resolution, company overview fetch, and financial statement fetch.

**Step 2:** Add local cache files for corp code resolution and stable DART metadata.

**Step 3:** Store the OpenDART API key through VS Code `SecretStorage` and expose lightweight UI/config actions.

**Step 4:** Add tests for parsing, cache behavior, missing key handling, and ambiguous/no-match cases.

### Task 4: Generate and persist the four insight artifacts

**Files:**
- Create: `src/core/insights.ts`
- Modify: `src/controller/forJobController.ts`
- Modify: `src/core/storage.ts`
- Test: `src/test/insights.test.ts`

**Step 1:** Build a dedicated insight-generation service that accepts reviewed posting fields, DART enrichment, and essay questions.

**Step 2:** Generate:
- `company-insight.md`
- `job-insight.md`
- `application-strategy.md`
- `question-analysis.md`

**Step 3:** Persist those artifacts as project documents and pin them by default.

**Step 4:** Add orchestration tests for generation, persistence, regeneration, and graceful partial-data behavior.

### Task 5: Add lightweight project Insights UX

**Files:**
- Modify: `src/webview/sidebarScript.ts`
- Modify: `src/webview/sidebarStyles.ts`
- Modify: `src/controller/sidebarStateStore.ts`
- Modify: `src/core/viewModels.ts`
- Test: `src/test/sidebarScript.test.ts`

**Step 1:** Add project-level inputs for posting URL and essay questions.

**Step 2:** Add insight actions and editable extraction review fields.

**Step 3:** Show current insight status and make generated insight docs naturally visible in the existing project document workflow.

**Step 4:** Add smoke-style tests that assert the new UI controls are present in the generated script.

### Task 6: Ensure run context integration and update docs

**Files:**
- Modify: `src/core/contextCompiler.ts`
- Modify: `README.md`
- Test: `src/test/contextCompiler.test.ts`

**Step 1:** Ensure insight artifacts are included by default through existing pinned-project-document behavior or an equivalent low-risk integration.

**Step 2:** Update docs for OpenDART key setup, posting analysis flow, insight artifacts, and fallback behavior.

**Step 3:** Extend context compiler tests to verify insight docs are included in future runs.

### Notes

- Risks:
  - posting HTML is highly variable, so reviewed extraction must remain mandatory
  - OpenDART coverage is incomplete for some companies and must degrade gracefully
  - artifact generation should not invent unsupported facts
- Follow-up:
  - optional external research/news layer
  - ambiguity resolver UI for multiple DART company matches
  - richer source appendix rendering
- Validation run:
  - `npm run test`
