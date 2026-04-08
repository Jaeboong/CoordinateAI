# Notion MCP Coordinator-Only Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional `Notion request` flow where only the selected coordinator provider uses its own Notion MCP before the review debate starts, then shares a `Notion Brief` with the reviewers.

**Architecture:** Keep Notion access out of `ForJob` itself. Extend the run request schema and `Runs` UI with a free-form `notionRequest`, execute one coordinator-only pre-pass in `ReviewOrchestrator`, persist the result as `notion-brief.md`, and inject that brief into reviewer/coordinator prompts. This preserves the current storage model while adding natural-language Notion grounding.

**Tech Stack:** TypeScript, VS Code extension webview, existing provider CLI adapters, zod schemas, node:test.

---

### Task 1: Extend run request and persistence models

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

Add a test case that expects a run record to preserve `notionRequest` and later store a generated `notionBrief`.

```ts
assert.equal(result.run.notionRequest, "CJ 올리브네트웍스 페이지 가져와서 파악해");
assert.match(await storage.readOptionalRunArtifact(project.slug, result.run.id, "notion-brief.md"), /Notion Brief/);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL because `RunRequest` / `RunRecord` do not include notion fields yet.

**Step 3: Write minimal implementation**

Add optional fields.

```ts
export interface RunRequest {
  // existing fields...
  notionRequest?: string;
}

export interface RunRecord {
  // existing fields...
  notionRequest?: string;
  notionBrief?: string;
}
```

Mirror the same optional fields in `RunRecordSchema`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test
```

Expected: the schema/type-related failure disappears.

**Step 5: Commit**

If this workspace is later moved into a git repo:

```bash
git add src/core/types.ts src/core/schemas.ts src/test/orchestrator.test.ts
git commit -m "feat: add notion fields to run models"
```

### Task 2: Add coordinator-only Notion pre-pass to the orchestrator

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

Add a test that:

- passes `notionRequest`
- expects coordinator pre-pass to run before reviewer round 1
- expects `notion-brief.md` to be written
- expects reviewer prompt text to include the brief

Minimal fake response contract:

```ts
if (providerId === "claude" && round === 0) {
  return [
    "## Resolution",
    "Confident match",
    "## Notion Brief",
    "CJ OliveNetworks hiring notes",
    "## Sources Considered",
    "- CJ OliveNetworks page"
  ].join("\\n");
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL because round 0 / brief persistence do not exist.

**Step 3: Write minimal implementation**

In `ReviewOrchestrator.run()`:

- before reviewer rounds, if `request.notionRequest?.trim()` exists:
  - build coordinator pre-pass prompt
  - execute coordinator with `round: 0`
  - parse/save the brief
  - store `notionBrief` on the run

Example shape:

```ts
let notionBrief = "";
if (request.notionRequest?.trim()) {
  const prePassPrompt = buildNotionPrePassPrompt(compiled.markdown, request);
  const prePassTurn = await this.executeTurn(..., request.coordinatorProvider, "coordinator", 0, prePassPrompt, ...);
  if (prePassTurn.status !== "completed") {
    throw new Error(prePassTurn.error ?? "Coordinator failed to resolve the Notion request.");
  }
  notionBrief = extractNotionBrief(prePassTurn.response);
  await this.storage.saveRunTextArtifact(request.projectSlug, runId, "notion-brief.md", prePassTurn.response);
  run = await this.storage.updateRun(request.projectSlug, runId, { notionRequest: request.notionRequest, notionBrief });
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test
```

Expected: PASS, and the new artifact exists.

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: add coordinator notion pre-pass"
```

### Task 3: Inject the Notion brief into reviewer and final prompts

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing test**

Assert that the reviewer prompt contains a `## Notion Brief` section when a brief exists, and does not contain it when no request was provided.

```ts
assert.match(reviewerPrompt, /## Notion Brief/);
assert.match(reviewerPrompt, /CJ OliveNetworks hiring notes/);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL because prompt builders currently accept only `contextMarkdown`.

**Step 3: Write minimal implementation**

Extend prompt builders with an optional `notionBrief`.

```ts
function appendNotionBrief(notionBrief?: string): string {
  return notionBrief?.trim() ? `## Notion Brief\\n\\n${notionBrief.trim()}\\n` : "";
}
```

Then inject it in:

- `buildReviewerPrompt(...)`
- `buildCoordinatorPrompt(...)`

Do not tell reviewers to search Notion directly.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run test
```

Expected: PASS with the brief present only when expected.

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: include notion brief in review prompts"
```

### Task 4: Add `Notion request` to the Runs UI and message payload

**Files:**
- Modify: `src/webview/sidebar.ts`
- Modify: `src/extension.ts`
- Modify: `src/core/types.ts`

**Step 1: Write the failing test**

There is no dedicated webview test harness yet, so use a lightweight extension-level assertion by keeping the payload shape explicit in code review and verifying end-to-end with `npm run test` plus manual smoke test.

Manual expectation:

- A new textarea is visible in `Runs`
- `runReview` payload includes `notionRequest`

**Step 2: Run current test suite**

Run:

```bash
npm run test
```

Expected: PASS before UI change, giving a stable baseline.

**Step 3: Write minimal implementation**

In `src/webview/sidebar.ts`:

- add a new textarea:

```html
<label>Notion request<textarea id="run-notion-request" placeholder="CJ 올리브네트웍스 페이지 가져와서 파악해"></textarea></label>
```

- include it in the payload:

```ts
notionRequest: document.getElementById("run-notion-request").value
```

In `src/extension.ts`:

```ts
notionRequest: String(payload.notionRequest || "")
```

**Step 4: Run tests and smoke test**

Run:

```bash
npm run test
```

Then manually:

1. `F5`
2. Open `Runs`
3. Enter a notion request
4. Start a run with a healthy coordinator

Expected: payload reaches orchestrator without breaking existing runs.

**Step 5: Commit**

```bash
git add src/webview/sidebar.ts src/extension.ts src/core/types.ts
git commit -m "feat: add notion request run input"
```

### Task 5: Surface the Notion brief artifact in run results

**Files:**
- Modify: `src/core/viewModels.ts`
- Modify: `src/webview/sidebar.ts`
- Modify: `src/extension.ts`

**Step 1: Write the failing test**

Use a small orchestrator/storage assertion to confirm `notion-brief.md` is written and then make the UI rely on the same artifact existence pattern used for summary/revised draft.

```ts
assert.ok(await storage.readOptionalRunArtifact(project.slug, run.id, "notion-brief.md"));
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL until the artifact is saved and exposed in the preview.

**Step 3: Write minimal implementation**

- extend run preview artifact booleans with `notionBrief`
- add an `Open notion brief` button in the run results card
- allow `openArtifact` for `notion-brief.md`

**Step 4: Run tests and manual smoke test**

Run:

```bash
npm run test
```

Manual check:

- execute a run with notion request
- confirm the run card shows `Open notion brief`
- open it and verify the saved Markdown

**Step 5: Commit**

```bash
git add src/core/viewModels.ts src/webview/sidebar.ts src/extension.ts src/test/orchestrator.test.ts
git commit -m "feat: expose notion brief artifact"
```

### Task 6: Harden prompts and document coordinator-only behavior

**Files:**
- Modify: `README.md`
- Modify: `src/core/orchestrator.ts`

**Step 1: Write the failing test**

Add a prompt expectation that reviewer prompts do not contain instructions like “search Notion” while coordinator pre-pass prompts do.

```ts
assert.doesNotMatch(reviewerPrompt, /search Notion/i);
assert.match(prePassPrompt, /use your configured Notion MCP/i);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test
```

Expected: FAIL until the prompt strings are explicit.

**Step 3: Write minimal implementation**

- make the pre-pass prompt explicit:
  - use configured Notion MCP
  - resolve confidently if possible
  - return `Resolution`, `Notion Brief`, `Sources Considered`
- keep reviewer prompts brief-only
- document in `README.md` that coordinator provider must already have Notion MCP configured

**Step 4: Run tests**

Run:

```bash
npm run test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts README.md src/test/orchestrator.test.ts
git commit -m "docs: explain coordinator-only notion mcp flow"
```

Plan complete and saved to `docs/plans/2026-03-31-notion-mcp-coordinator.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
