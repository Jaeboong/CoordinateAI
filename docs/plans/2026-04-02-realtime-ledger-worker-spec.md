# Realtime Ledger Reference Scoping — Revised Worker Spec

## Objective

Patch the realtime review flow so it converges on actionable essay improvements instead of repeatedly rephrasing the same issue.

Keep the original direction of the existing design:
- prevent self-referential reviewer cross-feedback,
- separate current-section blockers from follow-up tasks,
- preserve the blind-review rule,
- avoid widening scope into the deepFeedback path unless a shared helper must be touched.

Add the missing decision-policy changes that are required for real convergence:
- `REVISE` must become advisory rather than a hard blocker,
- only `BLOCK` or current-section `openChallenges` should prevent section closure,
- `deferredChallenges` must trigger section handoff rather than reopening the same section.

## Constraints

- Realtime only. Do not redesign deepFeedback unless a shared helper requires a safe compatibility change.
- Keep markdown-based outputs. Do not force fully structured JSON responses.
- Keep same-round reviewer blindness.
- Keep existing pause / redirect behavior.
- Prefer minimal changes over broad refactors.

## Design Decisions

### 1) Reference packet replaces freeform previous-round objection summary

Replace the current freeform reviewer-summary block with explicit references.

Reviewer prompt should receive:
- `## Coordinator Reference`
- `## Reviewer References`
- `## Discussion Ledger`
- `## Recent Discussion`

Each reference entry should include:
- `refId`
- `sourceLabel`
- `summary`

Example ref ids:
- `coord-r2`
- `rev-r2-reviewer-1`
- `rev-r2-reviewer-2`

Rules:
- Exclude the current reviewer's own previous-round reference by `participantId`, not by provider id.
- If there are no usable reviewer references, allow only the coordinator reference.
- `Cross-feedback:` must use this format:
  - `Cross-feedback: [refId] agree ...`
  - `Cross-feedback: [refId] disagree ...`

### 2) Section-scoped challenges

Extend the realtime ledger shape:
- `openChallenges`: blockers for the current `Target Section` only
- `deferredChallenges`: valid follow-up issues for later sections or final polish

Interpretation:
- If `Target Section = 직무 지원 이유`, then `마지막 포부 문단 구체화` belongs in `deferredChallenges`, not `openChallenges`.

### 3) Reviewer status semantics

Keep the status vocabulary:
- `APPROVE`
- `REVISE`
- `BLOCK`

But change semantics:
- `APPROVE`: current direction is section-ready
- `REVISE`: improvement is recommended but not blocking
- `BLOCK`: current section should not be finalized yet

Realtime convergence logic must treat:
- `BLOCK` as blocking
- `REVISE` as advisory

### 4) Section closure and document closure must be different states

Define:
- `sectionReady = openChallenges.length === 0 && no active reviewer returned BLOCK`
- `documentReady = sectionReady && deferredChallenges.length === 0`

Behavior:
- if `sectionReady` and `deferredChallenges.length > 0`, do **not** write final draft yet
- instead hand off to the next target section
- only write final draft when `documentReady`

### 5) Groupthink guard should stay narrow

Keep the early groupthink/devil’s-advocate path, but trigger it only on true early unanimity.

Recommended policy:
- trigger groupthink guard only when all active reviewers returned `APPROVE` before minimum rounds
- do not treat a mix of `APPROVE + REVISE` as false consensus requiring the guard

### 6) Realtime reviewer objection extraction must understand realtime format

The previous-round reviewer reference builder must prefer realtime fields.

Add a helper such as:
- `extractRealtimeReviewerChallenge(response)`

Priority order:
1. `Challenge:` line
2. `Cross-feedback:` only if needed
3. fallback to legacy extraction for deepFeedback-style outputs

Do not let realtime reviewer references default to the first non-status line if that line is `Mini Draft:`.

### 7) Notion handling should be reframed, not reimplemented from scratch

Do not spend effort re-adding punctuation-placeholder normalization if the repo already has it.

Instead focus on:
- distinguishing explicit user notion request vs auto-generated context request,
- using a correct label in the pre-pass prompt,
- avoiding misleading wording such as putting an auto-generated page-fetch request under `## User Notion Request`.

Recommended minimal design:
- build a small in-memory notion request descriptor:
  - `text`
  - `kind: "explicit" | "implicit" | "auto"`
- use prompt heading:
  - `## User Notion Request` for explicit/implicit
  - `## Auto Context Request` for auto

No persistence schema change is required unless clearly necessary.

## Implementation Plan

### Phase 0 — Pre-flight alignment

Before modifying code:
1. inspect the latest repo state,
2. verify which parts of the existing plan are already implemented,
3. note any stale assumptions in the old plan.

Expected outcome:
- confirm whether punctuation-only notion requests are already normalized,
- confirm current realtime consensus logic,
- confirm current ledger shape,
- confirm current reviewer prompt shape.

### Phase 1 — Ledger shape extension

Files:
- `src/core/types.ts`
- `src/core/schemas.ts`
- optionally UI/event-adjacent files only if compile/test requires it

Changes:
- add `deferredChallenges: string[]` to `DiscussionLedger`
- extend `DiscussionLedgerSchema`
- update discussion-ledger artifact builder/parser
- update event payload usage only where needed

Tests:
- schema accepts `deferredChallenges`
- ledger artifact includes `## Deferred Challenges`
- parser reads it back correctly

### Phase 2 — Reference packet and self-reference removal

Files:
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`

Changes:
- replace `buildPreviousRoundReviewerSummary` usage in realtime reviewer prompts with a reference packet
- build coordinator reference from latest coordinator ledger state / focus
- build reviewer references from previous-round reviewer turns
- exclude self by `participantId`
- change `Cross-feedback` prompt instruction to `[refId] agree|disagree ...`

Tests:
- reviewer prompt contains `Coordinator Reference`
- reviewer prompt contains another reviewer’s ref when available
- reviewer prompt does not contain the current reviewer’s own ref
- duplicate reviewer slots (`reviewer-1`, `reviewer-2`) remain distinct and self-exclusion is based on participant id

### Phase 3 — Realtime challenge extraction fix

Files:
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`

Changes:
- add realtime-specific extraction helper that prioritizes `Challenge:`
- use that helper when building reviewer references / summaries for realtime
- preserve deepFeedback behavior

Tests:
- previous-round reviewer reference uses the `Challenge:` line, not `Mini Draft:`
- legacy deepFeedback extraction still works

### Phase 4 — Section-scoped convergence policy

Files:
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`

Changes:
- update coordinator prompt to output `Deferred Challenges`
- update ledger parser and artifact renderer accordingly
- add helpers such as:
  - `hasBlockingRealtimeReviewer(...)`
  - `isCurrentSectionReady(...)`
  - `isWholeDocumentReady(...)`
- stop using all-`APPROVE` as the only realtime convergence criterion

Recommended logic:
- `hasBlockingRealtimeReviewer` = any active reviewer status is `BLOCK`
- `currentSectionReady` = ledger exists && `openChallenges.length === 0` && !blockingReviewer
- `wholeDocumentReady` = currentSectionReady && `deferredChallenges.length === 0`

Tests:
- `REVISE` without `BLOCK` does not prevent section closure when `openChallenges` are empty
- `BLOCK` still prevents closure
- section can close while `deferredChallenges` remain
- final draft is still withheld while `deferredChallenges` remain

### Phase 5 — Section handoff

Files:
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`

Changes:
- when current section is ready but `deferredChallenges` remain, transition to next section instead of finalizing or spinning in place
- next coordinator turn should retarget `Target Section` to the next deferred item or the section implied by it

Keep it simple:
- no challenge ticket system required in this patch
- string-based `deferredChallenges` is acceptable

Tests:
- when `openChallenges=[]` and `deferredChallenges=[...]`, the next round targets the deferred issue rather than reopening the completed section

### Phase 6 — Notion prompt labeling cleanup

Files:
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`

Changes:
- keep existing placeholder normalization behavior if already present
- introduce notion request descriptor for prompt labeling
- use `## Auto Context Request` when the request was auto-generated from project notion pages

Tests:
- punctuation-only manual request without fixed pages skips pre-pass or remains non-explicit
- auto-generated notion request uses `Auto Context Request`, not `User Notion Request`
- continuation-note implicit notion flow still works

### Phase 7 — UI follow-up

Files:
- `src/webview/sidebarScript.ts`
- `src/webview/sidebarStyles.ts`
- related tests only if needed

Changes:
- optionally show `Deferred Challenges` as a secondary list in live ledger UI
- preserve existing main emphasis on current focus / mini draft / open challenges

Tests:
- UI does not break when `deferredChallenges` is present
- secondary list renders when non-empty

### Phase 8 — Verification

Run:
- `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`
- targeted tests first
- then full suite

Acceptance criteria:
- no reviewer can see or cite its own previous-round objection reference
- realtime reviewer references are explicit and scoped
- current-section blockers and follow-up tasks are separated
- `REVISE` no longer behaves like `BLOCK`
- final draft waits for `deferredChallenges` to clear
- Notion pre-pass labeling is not misleading

## Expected Deliverables

1. code changes
2. updated tests
3. updated design doc and implementation plan docs so they match the actual shipped behavior
4. brief implementation summary covering:
   - what changed,
   - what tests were added/updated,
   - any deliberate deferrals

## Local Worker Prompt

You are implementing a focused patch in the CoordinateAI repository.

Your job is to revise the realtime review flow so it converges on actionable essay improvements instead of repeating adjacent feedback.

Read the current repo first and treat the repo as source of truth. Do not blindly follow the older plan files if the code has already moved.

## Mission

Implement a realtime-only patch with these goals:
1. remove self-referential cross-feedback in reviewer prompts,
2. separate current-section blockers from deferred follow-up tasks,
3. make `REVISE` advisory rather than a hard blocker,
4. hand off to the next section when the current one is done but deferred issues remain,
5. clean up Notion prompt labeling so auto-generated context requests are not presented as user-authored requests.

## Hard constraints

- Preserve the realtime blind-review rule.
- Do not broaden this into a deepFeedback redesign.
- Keep markdown outputs; do not force full JSON outputs.
- Make minimal, test-driven changes.
- Prefer adding small helpers over large refactors.
- Keep existing interactive pause / redirect behavior working.

## Required implementation details

### A. Extend realtime ledger
- Add `deferredChallenges` to the realtime `DiscussionLedger` type/schema.
- Update ledger artifact builder/parser accordingly.

### B. Replace freeform previous-round reviewer summary with scoped references
- Add `Coordinator Reference` and `Reviewer References` blocks.
- Reviewer references must exclude the current reviewer by `participantId`.
- `Cross-feedback:` must target one explicit reference in the form `[refId] agree ...` or `[refId] disagree ...`.

### C. Fix reviewer objection extraction for realtime
- Add a realtime-specific extractor that prioritizes the `Challenge:` line.
- Do not let the system summarize `Mini Draft:` as if it were the reviewer’s main objection.

### D. Change convergence policy
- `BLOCK` is blocking.
- `REVISE` is advisory.
- Current section is ready when there are no `openChallenges` and no active reviewer returned `BLOCK`.
- Whole document is ready only when the current section is ready and `deferredChallenges` is empty.

### E. Add section handoff
- If the current section is ready but `deferredChallenges` remains, do not finalize.
- Move the discussion to the next deferred issue / next target section.

### F. Clean up Notion labeling
- Keep existing placeholder normalization if already present.
- Distinguish explicit/implicit user notion request from auto-generated context request in the prompt heading.
- Use `Auto Context Request` for auto-generated page-fetch prompts.

## Testing requirements

Add or update tests for:
- self-reference exclusion using duplicate reviewer slots,
- reviewer prompt references,
- realtime challenge extraction preferring `Challenge:` over `Mini Draft:`,
- `REVISE` not blocking section closure,
- deferred section handoff,
- final draft blocked while deferred challenges remain,
- auto notion labeling,
- no regression in existing realtime redirect / pause behavior.

## File guidance

Primary files likely involved:
- `src/core/orchestrator.ts`
- `src/core/types.ts`
- `src/core/schemas.ts`
- `src/test/orchestrator.test.ts`
- optionally realtime UI files only if needed for `deferredChallenges`

Do not edit unrelated files unless required.

## Workflow

1. inspect current code and note stale assumptions from the old plan,
2. write failing tests first,
3. implement the smallest patch that makes them pass,
4. run targeted tests,
5. run full build + full test suite,
6. update the two plan/design docs so they match shipped behavior,
7. report exactly what changed and any deferred follow-up.

## Output format

When done, return:
1. a concise summary of changes,
2. touched files,
3. tests run and results,
4. any remaining risks or follow-up items.
