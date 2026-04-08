# Realtime Ticketized Handoff Implementation Plan

> Implementation status (2026-04-03): The current branch now includes the Phase 1-3 runtime foundation from this plan: ticket-backed realtime ledgers, structured coordinator outcome/decision blocks, ticket-first handoff ordering, and one-shot weak-consensus polish. Remaining intentional limits are that reviewer `Challenge:` normalization is used for prompt/reference parsing and backward-compatible summaries, while direct reviewer-driven ticket transitions are still coordinator-led, and the optional UI state badge / clustered ticket presentation is not yet shipped.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the realtime review flow from string-list challenge tracking to ticketized state transitions so current sections close deterministically, deferred work hands off in a stable order, and advisory-heavy weak consensus gets one controlled polish pass.

**Architecture:** Keep the shipped markdown ledger UX and blind-review prompt shape, but add a `ChallengeTicket` runtime model underneath it. Roll out in three safe phases: dual-write foundation first, structured prompt/parser adoption second, then ticket-first readiness/handoff plus a narrow weak-consensus polish round last. During rollout, `openChallenges` / `deferredChallenges` remain compatibility views derived from tickets or legacy arrays so mid-phase builds stay shippable.

**Tech Stack:** TypeScript, Zod, node:test, VS Code webview

---

## Stale Assumptions / Source-of-Truth Notes

- Source of truth is current `main`, not older Phase 1 plan files.
- Current shipped realtime code already has `deferredChallenges`, `Coordinator Reference`, `Reviewer References`, `Challenge:`-first realtime objection extraction, and `Auto Context Request` labeling in [src/core/orchestrator.ts](/home/cbkjh0225/project/forJob/src/core/orchestrator.ts).
- Current section readiness is already `openChallenges.length === 0 && no BLOCK`; `REVISE` is already advisory in shipped runtime.
- The new Phase 2 design doc [2026-04-02-realtime-ticketized-handoff-design.md](/home/cbkjh0225/project/forJob/docs/plans/2026-04-02-realtime-ticketized-handoff-design.md) is currently repo-local input, not the shipped implementation.
- The current runtime still uses human-readable ledger arrays as the effective source of truth. There is no shipped `ChallengeTicket`, `Section Outcome`, `Challenge Decisions`, `targetSectionKey`, or weak-consensus polish flow yet.

## Goals

- Replace loose string-array challenge state with a structured `ChallengeTicket` model in realtime mode only.
- Make current-section closure, deferred handoff, and final-draft gating deterministic in code.
- Normalize reviewer `Challenge:` output enough to drive state transitions while preserving markdown UX.
- Add a narrow weak-consensus detector so advisory-heavy sections get at most one polish round.
- Preserve blind review, pause/redirect behavior, markdown output, and deepFeedback behavior.

## Non-goals

- Redesigning the deepFeedback path
- Replacing markdown prompts with JSON-only protocol
- Rebuilding the webview layout
- Changing provider auth / MCP wiring / model selection flow
- Adding scoring, reranking, or multi-pass optimization outside the narrow weak-consensus pass

## Shipped Baseline vs Planned Changes

**Shipped baseline**

- `DiscussionLedger` contains `currentFocus`, `targetSection`, `miniDraft`, `acceptedDecisions`, `openChallenges`, `deferredChallenges`, `updatedAtRound`.
- Realtime reviewer prompts already use `Coordinator Reference` and `Reviewer References`, with self-reference exclusion by `participantId`.
- Realtime readiness already distinguishes `REVISE` from `BLOCK`.
- Deferred handoff exists, but it still depends on human-readable strings plus coordinator prompt compliance.

**Phase 2 changes**

- Add `ChallengeTicket` and `SectionOutcome` as runtime state.
- Introduce `targetSectionKey` so handoff ordering works on section clusters instead of raw strings.
- Add structured coordinator blocks:
  - `## Section Outcome`
  - `## Challenge Decisions`
- Normalize reviewer `Challenge:` grammar to:
  - `Challenge: [ticketId|new] close because ...`
  - `Challenge: [ticketId|new] keep-open because ...`
  - `Challenge: [ticketId|new] defer because ...`
- Switch runtime readiness and handoff to ticket-first logic after dual-write compatibility is in place.
- Add a one-shot weak-consensus polish round only when the current section is technically closable but reviewer sentiment is still mostly `REVISE`.

## Data Model Changes

### ChallengeTicket shape

```ts
export type ChallengeSeverity = "blocking" | "advisory";
export type ChallengeStatus = "open" | "deferred" | "closed";
export type ChallengeSource = "coordinator" | "reviewer" | "user" | "system";

export interface ChallengeTicket {
  id: string;
  text: string;
  sectionKey: string;
  sectionLabel: string;
  severity: ChallengeSeverity;
  status: ChallengeStatus;
  source: ChallengeSource;
  introducedAtRound: number;
  lastUpdatedAtRound: number;
  handoffPriority: number;
  evidenceNeeded?: string;
  closeCondition?: string;
}
```

### Ledger compatibility strategy

- Extend the realtime ledger type to include:
  - `targetSectionKey`
  - `tickets`
  - `sectionOutcome`
- Keep `openChallenges: string[]` and `deferredChallenges: string[]` in the public ledger shape during rollout.
- Treat those arrays as:
  - Phase 1: source of truth, with tickets dual-written from them
  - Phase 2: mixed mode, preferring structured blocks when present, falling back to arrays
  - Phase 3: derived view from tickets only
- Keep events, artifact rendering, and current webview lists consuming the human-readable arrays until ticket-first runtime is stable.

### Derived view rules

- `openChallenges` = open tickets for the current `targetSectionKey`
- `deferredChallenges` = deferred tickets, plus unresolved open tickets outside the current `targetSectionKey`
- `acceptedDecisions` remains human-readable markdown for now; do not introduce a structured decision log in this phase

## Orchestrator Change Scope

### Ticket lifecycle

- Add helpers for:
  - `applyCoordinatorChallengeDecisions(...)`
  - `applyReviewerChallengeSuggestions(...)`
  - `deriveLedgerViewsFromTickets(...)`
  - `seedTicketsFromLegacyLedger(...)`
- Supported ticket transitions:
  - `add`
  - `keep-open`
  - `defer`
  - `promote`
  - `close`
- Runtime validation rules:
  - unknown ticket ids are ignored unless explicitly treated as `[new]`
  - malformed structured lines fall back to legacy behavior
  - `write-final` cannot bypass unresolved deferred tickets

### Handoff ordering

- Add `targetSectionKey` and cluster unresolved tickets by that key.
- Pick next handoff cluster by:
  1. cluster with blocking ticket
  2. higher `handoffPriority`
  3. earlier `introducedAtRound`
  4. more unresolved tickets
- When a deferred cluster becomes the next target section, promote that cluster’s deferred tickets to open by default in the first safe slice.

### Weak-consensus detection

- Add `shouldRunWeakConsensusPolish(...)`
- Trigger only when:
  - current section is ready
  - no reviewer returned `BLOCK`
  - active reviewer majority returned `REVISE`
  - current section has not already used its polish round
- Never trigger more than once per section key

### One-shot polish round

- Add one coordinator-only polish turn for advisory cleanup
- Do not let the polish round invent a new endless loop:
  - one shot per `targetSectionKey`
  - after polish, continue with normal close / handoff / reopen logic

## Coordinator / Reviewer Prompt Grammar Changes

### Coordinator prompt changes

Add required sections in realtime coordinator prompts:

- `## Section Outcome`
- `## Challenge Decisions`

Allowed `Section Outcome` values:

- `keep-open`
- `close-section`
- `handoff-next-section`
- `write-final`

`Challenge Decisions` lines must allow:

- `[ticketId] close`
- `[ticketId] keep-open`
- `[ticketId] defer`
- `[ticketId] promote`
- `[new] add | sectionKey=... | sectionLabel=... | severity=... | text=...`

Runtime must validate these blocks rather than trust them blindly.

### Reviewer prompt changes

Keep the current 3-line + status markdown style, but normalize `Challenge:` to:

- `Challenge: [ticketId|new] close because ...`
- `Challenge: [ticketId|new] keep-open because ...`
- `Challenge: [ticketId|new] defer because ...`

### Backward compatibility

- If `Section Outcome` or `Challenge Decisions` is missing, continue using legacy ledger parsing.
- If reviewer `Challenge:` does not match the new grammar, continue using:
  - normalized `Challenge:` free text summary
  - existing `Status:` extraction
- Keep current `Coordinator Reference` / `Reviewer References` blocks intact; Phase 2 should not reopen the self-reference problem.

## UI / Artifact Impact

### Keep stable in early phases

- Live ledger summary can continue rendering:
  - current focus
  - mini draft
  - open challenges
  - deferred challenges
- Do not require the webview to understand tickets in Phase 1.

### Late-phase additions

- Append a ticket summary section to `discussion-ledger.md`
- Optionally add a lightweight section-state badge in the live ledger summary:
  - `열림`
  - `닫힘`
  - `handoff`
  - `최종 작성 가능`
- If webview protocol needs to carry tickets, add them only after core runtime tests pass; keep array fields for compatibility

## Test Plan

### Unit tests

- Challenge ticket lifecycle helpers
- `Section Outcome` parser
- `Challenge Decisions` parser
- normalized reviewer `Challenge:` parser
- target-section cluster selection
- weak-consensus detector
- ledger derivation from tickets

### Integration tests

- current section closes from ticket state with no blocking ticket
- deferred cluster handoff selects the correct next section key
- coordinator `write-final` is downgraded when deferred tickets remain
- weak-consensus polish runs once, then closes or hands off
- malformed structured blocks fall back to legacy ledger behavior

### Regression tests

- same-round blind review remains intact
- pause / redirect behavior remains intact
- final draft gating remains intact
- auto notion labeling remains intact
- existing realtime reviewer reference behavior remains intact
- deepFeedback tests remain unchanged

## Implementation Phases

### Phase 1: Dual-write foundation

Smallest safe slice. No behavior switch yet.

Deliverables:

- `ChallengeTicket`, `SectionOutcome`, extended realtime ledger types/schemas
- seed/derive helpers that can build tickets from the existing array-based ledger
- tests proving derived arrays match current behavior
- no required prompt change yet

Rollback point:

- keep runtime array-first
- ignore new ticket fields in prompt/runtime if anything becomes unstable

### Phase 2: Structured prompt/parser adoption

Adopt new coordinator/reviewer grammar while preserving legacy fallback.

Deliverables:

- coordinator prompt emits `Section Outcome` and `Challenge Decisions`
- reviewer prompt emits normalized `Challenge:` grammar
- tolerant parsers use structured blocks when present, fallback otherwise
- arrays still exposed to UI/artifact as compatibility view

Rollback point:

- keep prompts but disable structured parser preference
- fallback entirely to legacy arrays and status extraction

### Phase 3: Ticket-first runtime and weak-consensus polish

Enable real behavior changes only after Phases 1 and 2 are green.

Deliverables:

- ticket-first readiness and handoff ordering
- cluster-based deferred promotion
- outcome validation / downgrade logic
- one-shot weak-consensus polish
- optional artifact appendix and lightweight UI state badge

Rollback point:

- disable ticket-first handoff helper and weak-consensus polish
- continue shipping structured blocks while runtime uses derived legacy arrays

## Detailed Task Breakdown

### Task 1: Add ticket types and dual-write schema support

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/schemas.ts`
- Modify: `src/test/webviewProtocol.test.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add schema expectations for `targetSectionKey`, `sectionOutcome`, and `tickets` on the realtime ledger shape.
- Add a minimal orchestrator-facing test that derived `openChallenges` / `deferredChallenges` still behave like the shipped arrays when tickets are present.

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/webviewProtocol.test.js dist/test/orchestrator.test.js`

Expected: FAIL because the ledger schema does not yet accept the new fields.

**Step 3: Write the minimal implementation**

- Add `ChallengeTicket`, `SectionOutcome`, and extended realtime ledger fields.
- Keep new fields optional during Phase 1 if needed to minimize churn.
- Add seed/derive helpers, but do not switch the runtime to ticket-first yet.

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/webviewProtocol.test.js dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/schemas.ts src/test/webviewProtocol.test.ts src/test/orchestrator.test.ts
git commit -m "feat: add realtime challenge ticket types"
```

### Task 2: Add legacy-to-ticket derivation helpers without behavior change

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add unit-style orchestrator tests for:
  - seed tickets from legacy ledger arrays
  - derive `openChallenges` / `deferredChallenges` from ticket state
  - preserve existing readiness results when the same challenge information is expressed through tickets

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: FAIL because ticket helpers do not exist yet.

**Step 3: Write the minimal implementation**

- Add pure helpers:
  - `seedTicketsFromLegacyLedger(...)`
  - `deriveLedgerViewsFromTickets(...)`
  - `normalizeSectionKey(...)`
- Keep the realtime run loop using current array-based readiness and handoff for now.

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: add legacy-to-ticket realtime helpers"
```

### Task 3: Emit and parse structured coordinator output with fallback

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add parser tests for:
  - `## Section Outcome`
  - `## Challenge Decisions`
  - invalid structured lines being ignored
  - fallback to legacy `Open Challenges` / `Deferred Challenges`

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: FAIL because the structured blocks are not parsed yet.

**Step 3: Write the minimal implementation**

- Extend coordinator discussion / redirect / challenge prompts to ask for:
  - `Section Outcome`
  - `Challenge Decisions`
- Add parsers:
  - `extractSectionOutcome(...)`
  - `extractChallengeDecisions(...)`
- Prefer structured blocks when present, otherwise keep current legacy parsing path.

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: parse structured realtime coordinator decisions"
```

### Task 4: Normalize reviewer `Challenge:` grammar with backward compatibility

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add reviewer parsing tests for:
  - `[ticketId] close because ...`
  - `[ticketId] keep-open because ...`
  - `[ticketId] defer because ...`
  - `[new] defer because ...`
  - malformed reviewer challenge lines falling back to the shipped extractor

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: FAIL because the new reviewer grammar parser does not exist yet.

**Step 3: Write the minimal implementation**

- Update realtime reviewer prompt instructions to prefer the normalized grammar.
- Add:
  - `extractNormalizedReviewerChallenge(...)`
  - tolerant fallback to current `Challenge:` free-text handling
- Do not change blind review or reference packet behavior.

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: normalize realtime reviewer challenge grammar"
```

### Task 5: Switch handoff ordering to ticket-first clusters

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add integration tests for:
  - cluster-based next section selection
  - deferred cluster promotion on handoff
  - current section close with ticket-first logic
  - final draft still blocked when unresolved deferred clusters remain
  - coordinator `write-final` / `handoff-next-section` outcomes being downgraded when invalid

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: FAIL because the runtime still uses array-first handoff and readiness logic.

**Step 3: Write the minimal implementation**

- Add:
  - `pickNextTargetSectionCluster(...)`
  - `validateSectionOutcome(...)`
  - ticket-first `isCurrentSectionReady(...)`
  - ticket-first `isWholeDocumentReady(...)`
- Keep array fields derived for artifact/UI compatibility.

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: switch realtime handoff to ticket-first clusters"
```

### Task 6: Add narrow weak-consensus polish

**Files:**
- Modify: `src/core/orchestrator.ts`
- Test: `src/test/orchestrator.test.ts`

**Step 1: Write the failing tests**

- Add tests proving:
  - majority `REVISE` with no `BLOCK` triggers polish exactly once per section
  - polish does not trigger on `APPROVE + REVISE` minority cases
  - polish does not loop forever
  - a later `BLOCK` reopens normal section flow

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: FAIL because no weak-consensus path exists yet.

**Step 3: Write the minimal implementation**

- Add per-section memory for `polishRoundUsed`
- Add `shouldRunWeakConsensusPolish(...)`
- Add a coordinator-only polish prompt or reuse the discussion prompt with a narrow polish instruction
- Make sure this path is limited to one round per section key

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/test/orchestrator.test.ts
git commit -m "feat: add realtime weak-consensus polish round"
```

### Task 7: Update artifact and optional UI follow-up

**Files:**
- Modify: `src/core/orchestrator.ts`
- Modify: `src/webview/sidebarScript.ts`
- Test: `src/test/sidebarScript.test.ts`
- Test: `src/test/webviewProtocol.test.ts`

**Step 1: Write the failing tests**

- Add tests for:
  - ticket appendix in `discussion-ledger.md`
  - optional section-state badge or non-breaking UI text
  - webview protocol compatibility if ledger events expose extra fields

**Step 2: Run tests to verify they fail**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/sidebarScript.test.js dist/test/webviewProtocol.test.js dist/test/orchestrator.test.js`

Expected: FAIL because artifacts/UI do not reflect ticket-first metadata yet.

**Step 3: Write the minimal implementation**

- Append human-readable ticket summary to `discussion-ledger.md`
- Keep current live ledger UI lists intact
- Add only lightweight status metadata if it can be done without destabilizing the webview

**Step 4: Run tests to verify they pass**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json && ./scripts/with-node.sh --test dist/test/sidebarScript.test.js dist/test/webviewProtocol.test.js dist/test/orchestrator.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts src/webview/sidebarScript.ts src/test/sidebarScript.test.ts src/test/webviewProtocol.test.ts src/test/orchestrator.test.ts
git commit -m "feat: expose ticketized realtime ledger artifacts"
```

### Task 8: Full verification and rollout check

**Files:**
- Modify: `docs/plans/2026-04-02-realtime-ticketized-handoff-design.md`
- Modify: `docs/plans/2026-04-02-realtime-ticketized-handoff.md`

**Step 1: Run the full build**

Run: `./scripts/with-node.sh node_modules/typescript/lib/tsc.js -p tsconfig.json`

Expected: PASS

**Step 2: Run the full test suite**

Run: `./scripts/with-node.sh --test dist/test/*.test.js`

Expected: PASS

**Step 3: Update docs to match shipped behavior**

- Update the Phase 2 design doc if implementation intentionally narrows any design surface.
- Keep the implementation plan aligned with what actually shipped.

**Step 4: Optional WSL sync if this work is being deployed immediately**

Run:

```bash
rsync -a dist/ /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/dist/
cp package.json /home/cbkjh0225/.vscode-server/extensions/local.forjob-0.0.1/package.json
```

Expected: the installed WSL extension reflects the latest runtime files.

**Step 5: Commit**

```bash
git add docs/plans/2026-04-02-realtime-ticketized-handoff-design.md docs/plans/2026-04-02-realtime-ticketized-handoff.md
git commit -m "docs: align ticketized handoff phase 2 plan"
```

## Acceptance Criteria

The Phase 2 rollout is complete only when all of the following are true:

1. Realtime runtime can maintain `ChallengeTicket` state without breaking the current markdown ledger UX.
2. `openChallenges` and `deferredChallenges` are deterministic derived views from tickets in the final phase.
3. Coordinator `Section Outcome` and `Challenge Decisions` are parsed when present, with safe fallback when absent or malformed.
4. Reviewer `Challenge:` lines can yield `ticketId` plus `close|keep-open|defer` in the normalized path.
5. Deferred handoff selects the next section by ticket cluster rather than raw string order.
6. Majority-`REVISE` weak consensus triggers at most one polish round per section key.
7. `BLOCK`, final draft gating, blind review, notion labeling, pause, and redirect behavior all retain existing guarantees.
8. Full build and `./scripts/with-node.sh --test dist/test/*.test.js` both pass.

## Remaining Risks and Rollback Points

### Risks

- Structured prompt output may be brittle when models partially follow the new grammar.
- Ticket-first runtime can accidentally re-open a closed section if section-key normalization is unstable.
- Weak-consensus polish can regress into a new loop source if the one-shot guard is not truly per-section.
- UI expansion can add noise before ticket-first runtime is proven stable.

### Rollback points

- After Phase 1: keep tickets as shadow state only, arrays remain source of truth.
- After Phase 2: keep structured prompts but disable structured parser preference.
- After Phase 3: disable ticket-first readiness/handoff and weak-consensus polish, while continuing to ship compatibility arrays and legacy behavior.
