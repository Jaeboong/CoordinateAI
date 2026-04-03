# Realtime Ticketized Handoff Design (Phase 2)

> Implementation note (2026-04-03): The current branch now ships the core ticketized realtime runtime described here: `ChallengeTicket`-backed ledgers, `targetSectionKey`, structured coordinator `Section Outcome` / `Challenge Decisions`, ticket-first handoff validation, and one-shot weak-consensus polish. Reviewer `Challenge:` normalization is currently used to stabilize summaries and prompt grammar, while ticket state transitions remain coordinator-driven with legacy-compatible fallback.

## Summary

1차 패치로 realtime review flow는 다음 문제를 상당 부분 해소했다.

- reviewer self-reference와 자유형 previous-round summary 의존
- 현재 섹션 blocker와 후속 과제의 혼재
- `REVISE`가 실질적으로 hard blocker처럼 동작하던 문제
- auto-generated notion request가 user-authored request처럼 보이던 문제

하지만 현재 구현은 아직 아래 한계를 가진다.

- `openChallenges`, `deferredChallenges`가 `string[]`라 상태 전이가 느슨하다.
- deferred handoff는 runtime guard와 coordinator prompt에 일부 의존한다.
- reviewer의 `Challenge:` 라인은 자유문이라 기계적으로 close / keep-open / defer를 안정적으로 파싱하기 어렵다.
- `BLOCK`이 없어도 reviewer 다수가 `REVISE`를 내는 약한 합의 상태가 section closure로 지나갈 수 있다.

2차 설계의 목표는 **현재 섹션을 더 단단하게 닫고, 다음 섹션으로의 handoff를 코드 레벨에서 강제하며, reviewer 판단을 상태 전이에 직접 연결하는 것**이다.

핵심 수단은 다음 네 가지다.

1. `ChallengeTicket` 기반 ticketized ledger
2. section-grouped handoff ordering
3. reviewer `Challenge:` 판단의 정규화
4. narrow `weak-consensus` detector + one-shot polish round

---

## Goals

- realtime 경로에서 쟁점 상태를 문자열 목록이 아니라 구조화된 ticket로 관리한다.
- 현재 섹션 종료, 후속 섹션 handoff, 최종 문안 작성의 전이 규칙을 명시적으로 만든다.
- reviewer의 `Challenge:`를 상태 전이에 사용할 수 있는 수준까지 정규화한다.
- `BLOCK`이 없더라도 다수 `REVISE`가 남아 있는 약한 합의를 한 번 더 정리할 기회를 만든다.
- 기존 blind review rule, markdown 중심 출력, interactive pause/redirect 흐름은 유지한다.

## Non-goals

- deepFeedback 경로 redesign
- 전면적인 JSON-only protocol 도입
- UI 전체 재설계
- provider capability / auth / MCP wiring 변경
- scoring model, ranking model, reranker 도입

---

## Current Shipped Baseline

현재 realtime 설계의 shipped behavior는 아래와 같다.

- `DiscussionLedger`는 `currentFocus`, `targetSection`, `miniDraft`, `acceptedDecisions`, `openChallenges`, `deferredChallenges`, `updatedAtRound`를 가진다.
- `openChallenges`는 현재 `Target Section` blocker이고 `deferredChallenges`는 후속 과제다.
- reviewer prompt는 `Coordinator Reference`와 `Reviewer References` packet을 사용하고, participantId 기준으로 자기 reference를 제외한다.
- realtime objection extraction은 `Challenge:`를 우선 사용한다.
- 현재 section ready는 `openChallenges.length === 0 && no BLOCK`이다.
- whole document ready는 current section ready이면서 `deferredChallenges.length === 0`일 때다.
- current section ready인데 deferred가 남으면 final draft 대신 다음 round로 넘어간다.

이 baseline은 유지하되, source of truth를 `string[]`에서 ticket state로 올리는 것이 2차 설계의 핵심이다.

---

## Design Overview

### High-level change

현재 구조:

- coordinator가 human-readable ledger를 갱신
- runtime이 `openChallenges` / `deferredChallenges` 문자열 배열과 reviewer status만 보고 상태를 추론

2차 구조:

- coordinator가 human-readable ledger **+ structured challenge decisions**를 함께 출력
- runtime이 `ChallengeTicket` 상태를 갱신
- `openChallenges` / `deferredChallenges`는 ticket state에서 **derived view**로 만든다
- handoff target과 section close 여부는 runtime이 ticket와 outcome을 바탕으로 결정한다

즉, 사람에게 보이는 markdown은 유지하되, **실제 상태 전이는 ticket model을 source of truth로 사용**한다.

---

## Core Data Model

### 1. ChallengeTicket

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

### 2. DiscussionLedgerV2

```ts
export type SectionOutcome = "keep-open" | "close-section" | "handoff-next-section" | "write-final";

export interface DiscussionLedgerV2 {
  currentFocus: string;
  targetSection: string;
  targetSectionKey: string;
  miniDraft: string;
  acceptedDecisions: string[];
  openChallenges: string[];      // derived
  deferredChallenges: string[];  // derived
  tickets: ChallengeTicket[];
  sectionOutcome: SectionOutcome;
  updatedAtRound: number;
}
```

### 3. Why keep both tickets and arrays?

- `tickets`가 runtime source of truth다.
- `openChallenges`, `deferredChallenges`는 prompt/UI/artifact 호환용 derived field다.
- 기존 webview와 artifact 포맷을 한 번에 깨지 않기 위해 dual representation을 유지한다.

---

## Section Model

### sectionKey vs sectionLabel

문자열 handoff의 가장 큰 약점은 “후속 과제 3개가 사실상 같은 섹션인데도 서로 다른 문자열이라 각기 다른 이슈처럼 흐를 수 있다”는 점이다.

이를 해결하기 위해 섹션을 두 층으로 나눈다.

- `sectionKey`: 안정적 식별자
  - 예: `motivation-why-banking`, `motivation-why-company`, `future-impact`, `proof-density`
- `sectionLabel`: 모델이 사용자에게 보여줄 자연어 라벨
  - 예: `직무 지원 이유`, `왜 신한인가`, `입행 후 포부`, `운영 근거 보강`

runtime은 `sectionKey`로 그룹핑하고, UI와 markdown은 `sectionLabel`을 중심으로 보여준다.

---

## Structured Coordinator Output

현재 coordinator는 아래 top-level section을 출력한다.

- `## Current Focus`
- `## Target Section`
- `## Mini Draft`
- `## Accepted Decisions`
- `## Open Challenges`
- `## Deferred Challenges`

2차 설계에서는 여기에 두 블록을 추가한다.

- `## Section Outcome`
- `## Challenge Decisions`

### Section Outcome

허용값:

- `keep-open`
- `close-section`
- `handoff-next-section`
- `write-final`

예시:

```md
## Section Outcome
handoff-next-section
```

### Challenge Decisions

형식:

```md
## Challenge Decisions
- [c1] close
- [c2] keep-open
- [c3] defer
- [c4] promote
- [new] add | sectionKey=future-impact | sectionLabel=입행 후 포부 | severity=advisory | text=포부를 거래 안정성 관점으로 더 구체화한다
```

설명:

- `close`: 현재 라운드에서 해결된 ticket
- `keep-open`: 현재 target section blocker/advisory로 유지
- `defer`: 다른 섹션/마지막 polish로 넘김
- `promote`: deferred ticket을 현재 섹션의 active ticket로 승격
- `add`: 새 ticket 생성

### Source of truth rule

2차 이후에는 coordinator의 `Open Challenges` / `Deferred Challenges` 목록은 **설명용**이다. 실제 상태 갱신은 `Challenge Decisions`를 기준으로 수행한다.

---

## Reviewer Output Normalization

현재 reviewer는 자유문 `Challenge:`를 쓴다.

2차 설계에서는 label은 유지하되 grammar를 정규화한다.

### New reviewer line grammar

```text
Mini Draft: <keep/revise point>
Challenge: [ticketId|new] <close|keep-open|defer> because <reason>
Cross-feedback: [refId] agree ... / disagree ...
Status: APPROVE | REVISE | BLOCK
```

예시:

```text
Mini Draft: "같은 데이터가 끝까지 같아야 하는 시스템"은 유지하는 편이 좋습니다.
Challenge: [c2] keep-open because 왜 일반 백엔드가 아니라 은행인지의 연결이 아직 한 문장 부족합니다.
Cross-feedback: [rev-r2-reviewer-1] agree 같은 이유로 은행성을 한 번 더 닫아야 합니다.
Status: BLOCK
```

또는 새 ticket 제안:

```text
Challenge: [new] defer because 마지막 포부 문단 구체화는 현재 섹션 blocker보다 후순위입니다.
```

### Why keep `Status` separately?

- `Status`는 reviewer가 현재 섹션 closure를 허용하는지에 대한 coarse signal이다.
- `Challenge:` verdict는 어떤 ticket을 어떻게 처리할지에 대한 fine-grained signal이다.
- 둘을 분리해야 `REVISE` advisory 상태와 ticket disposition을 동시에 다룰 수 있다.

---

## Ticket State Transition Rules

### 1. Add

- coordinator `add` 또는 reviewer `[new]`
- runtime이 새 ticket id를 발급한다.
- severity default:
  - coordinator가 `Open Challenges` 문맥에서 넣으면 `blocking`
  - coordinator가 `Deferred Challenges` 문맥에서 넣으면 `advisory`
  - reviewer `[new]`는 default `advisory`

### 2. Keep-open

- ticket `status = open`
- `sectionKey = current targetSectionKey`

### 3. Defer

- ticket `status = deferred`
- `severity` 유지
- `sectionKey`가 current와 다르면 그대로 유지
- current와 같더라도 later polish로 보내는 경우 `sectionKey = polish:<currentSectionKey>`로 재keying 가능

### 4. Promote

- ticket `status = open`
- `sectionKey = current targetSectionKey`
- 현재 라운드에서 집중 대상으로 승격

### 5. Close

- ticket `status = closed`
- closeCondition이 있으면 보존

---

## Derived Views

runtime은 ticket에서 human-readable ledger view를 다시 만든다.

### openChallenges derivation

- `tickets.filter(t => t.status === "open" && t.sectionKey === targetSectionKey)`
- 화면/아티팩트에는 `text`만 노출

### deferredChallenges derivation

- `tickets.filter(t => t.status === "deferred" || (t.status === "open" && t.sectionKey !== targetSectionKey))`
- 정렬은 아래 handoff ordering과 동일하게 한다.

### acceptedDecisions

- 기존과 동일하게 human-readable bullet을 유지하되,
- 이후 확장 가능성을 위해 내부적으로는 별도 `decisionLog`를 둘 수 있다.

---

## Handoff Ordering

### Problem

현재는 “deferred issue가 남으면 다음 round로 간다”까지는 구현됐지만, **어떤 deferred issue를 다음 target section으로 고를지**는 prompt 의존이 크다.

### New rule

다음 target section은 ticket cluster 단위로 선택한다.

#### Step 1. unresolved deferred clusters 생성

```ts
const clusters = groupBy(
  tickets.filter((t) => t.status !== "closed" && t.sectionKey !== currentTargetSectionKey),
  (t) => t.sectionKey
);
```

#### Step 2. cluster score 계산

기본 정렬 우선순위:

1. blocking ticket 포함 cluster 우선
2. 더 높은 `handoffPriority`
3. 더 이른 `introducedAtRound`
4. 더 많은 unresolved ticket 수

#### Step 3. next section 확정

- 최상위 cluster의 `sectionKey`를 다음 `targetSectionKey`로 사용
- `sectionLabel`은 cluster 내 가장 최근 label 또는 coordinator가 명시한 label 사용
- 해당 cluster의 ticket 중 `status === deferred`인 것을 `open`으로 승격할지 여부는 아래 규칙을 따른다.

### Promote-on-handoff rule

- 다음 섹션으로 실제 handoff할 때, 그 `sectionKey`에 속한 `deferred` ticket은 기본적으로 모두 `open`으로 승격한다.
- 다만 `severity === advisory`이고 `handoffPriority`가 낮은 ticket은 `deferred` 상태를 유지해도 된다.
- 기본 정책은 단순화를 위해 **모두 승격**으로 시작하는 것이 안전하다.

### Why cluster handoff?

문자열 한 줄씩 handoff하면 같은 섹션이 ticket 하나씩 흩어져 또 회전할 수 있다. cluster handoff는 이를 줄인다.

---

## Readiness and Outcome Rules

### Current section ready

```ts
currentSectionReady =
  noOpenBlockingTicketsForCurrentSection &&
  noReviewerReturnedBlock;
```

즉, 1차 설계의 `openChallenges.length === 0 && no BLOCK`를 ticket 기준으로 재정의한다.

### Whole document ready

```ts
wholeDocumentReady =
  currentSectionReady &&
  noUnresolvedDeferredTickets;
```

### Coordinator `Section Outcome` validation

runtime은 coordinator가 선언한 `sectionOutcome`를 그대로 믿지 않는다. 아래 검증을 통과해야 한다.

- `write-final`은 `wholeDocumentReady === true`일 때만 허용
- `close-section`은 `currentSectionReady === true`일 때만 허용
- `handoff-next-section`은 `currentSectionReady === true && unresolvedDeferredExists`일 때만 허용
- `keep-open`은 항상 허용

검증 실패 시 runtime은 coordinator outcome을 보정한다.

예:

- coordinator가 `write-final`을 냈지만 unresolved deferred가 남아 있으면 `handoff-next-section` 또는 `keep-open`으로 downgrade

---

## Weak Consensus Detector

### Why needed

1차 설계 이후 `REVISE`는 advisory가 됐다. 이건 맞는 방향이다. 하지만 reviewer 다수가 `REVISE`를 주는 상태가 곧바로 section close로 통과되면, “논리적 blocker는 없지만 품질적으로 아직 미정리”인 상태를 한 번 놓칠 수 있다.

### Narrow policy

weak consensus는 아래에서만 발동한다.

- `currentSectionReady === true`
- `BLOCK` 없음
- reviewer 과반이 `REVISE`
- 해당 section에서 아직 `polishRoundUsed === false`

### Behavior

- section을 바로 닫지 않고, coordinator에게 **one-shot polish round**를 한 번 더 준다.
- 이 round는 새로운 blocker 발굴이 목적이 아니라 advisory critique 흡수용이다.
- round가 끝난 뒤에는 다시 같은 이유로 weak consensus를 발동하지 않는다.

### Not a new loop source

- section당 최대 1회만 발동
- `BLOCK`이 새로 나오면 일반 open flow로 복귀
- `BLOCK`이 계속 없으면 polish 후 close 또는 handoff로 진행

### Why not trigger on every REVISE?

그렇게 하면 1차 설계의 장점이 사라지고 다시 회전이 생긴다. weak consensus detector는 **좁고 일회성**이어야 한다.

---

## Prompt Changes

### Coordinator discussion prompt

추가 요구:

- `## Section Outcome` 반드시 포함
- `## Challenge Decisions` 반드시 포함
- 현재 라운드에서 다룰 primary cluster를 1개만 유지
- `Open Challenges` / `Deferred Challenges`는 ticket state와 일치하게 서술

추가 instruction 예시:

- "Use `Challenge Decisions` as the source of truth for ticket state transitions."
- "If the current section is ready and deferred ticket clusters remain, choose the next cluster and set `Section Outcome` to `handoff-next-section`."
- "Do not reopen a closed section unless a reviewer returned BLOCK with a current-section reason."

### Reviewer prompt

변경점:

- `Challenge:` line grammar를 강제
- reference packet은 유지
- same-round blind rule 유지
- `Status:` semantics 유지

추가 instruction 예시:

- "Use exactly one ticket verdict in the `Challenge:` line."
- "Use `[new]` only when you are proposing a new challenge that is not already represented in the current ledger."

---

## Parser and Runtime Changes

### 1. New parser helpers

- `extractSectionOutcome(response): SectionOutcome | undefined`
- `extractChallengeDecisions(response): ParsedChallengeDecision[]`
- `extractNormalizedReviewerChallenge(response): ReviewerChallengeVerdict | undefined`

### 2. Runtime state transition helpers

- `applyCoordinatorChallengeDecisions(...)`
- `applyReviewerChallengeSuggestions(...)`
- `deriveLedgerViewsFromTickets(...)`
- `pickNextTargetSectionCluster(...)`
- `shouldRunWeakConsensusPolish(...)`

### 3. Backward compatibility

초기 롤아웃에서는 아래 순서로 동작한다.

1. 새 structured blocks가 있으면 새 parser 사용
2. 없으면 legacy `openChallenges` / `deferredChallenges` parser fallback
3. artifact와 UI에는 계속 human-readable lists 출력

즉, coordinator/reviewer prompt를 바꾸는 동안에도 runtime이 완전히 깨지지 않도록 한다.

---

## UI / Artifact Changes

### Live ledger UI

현재 UI는 후속 과제를 별도 리스트로 보여준다. 2차에서는 아래를 추가한다.

- 현재 섹션 상태 배지: `열림 / 닫힘 / handoff / 최종 작성 가능`
- ticket cluster 단위 후속 과제 묶음
- weak-consensus polish가 발동한 section 표시

### discussion-ledger.md artifact

사람이 읽는 형태는 유지하되, 하단에 ticket summary appendix를 추가한다.

예시:

```md
## Challenge Tickets
- [c1] blocking | closed | motivation-why-banking | 왜 은행이어야 하는지 한 문장 더 필요함
- [c2] advisory | deferred | future-impact | 포부를 거래 안정성 관점으로 더 구체화
```

중요: artifact는 여전히 markdown이어야 하며, 사용자가 바로 읽을 수 있어야 한다.

---

## Testing Plan

### Parser tests

- `Section Outcome` 파싱
- `Challenge Decisions` 파싱
- reviewer `Challenge:` normalized grammar 파싱
- legacy fallback 유지

### Runtime tests

- ticket `add / keep-open / defer / promote / close` 전이
- open/deferred derived view가 targetSectionKey에 따라 정확히 계산되는지
- handoff가 ticket cluster 단위로 발생하는지
- current section ready / whole document ready가 ticket 기준으로 계산되는지
- coordinator가 잘못된 `Section Outcome`를 내도 runtime이 보정하는지

### Consensus tests

- `BLOCK` 있으면 closure 불가
- `REVISE`만 있고 open blocking ticket이 없으면 closure 가능
- reviewer 과반 `REVISE`일 때 weak-consensus polish round가 section당 1회만 발동하는지
- polish round 이후 무한 loop가 생기지 않는지

### Backward compatibility tests

- old coordinator output만 있어도 legacy parser로 동작하는지
- old reviewer output만 있어도 `Status`와 legacy objection 추출이 유지되는지

### Existing behavior regression

- same-round blind rule 유지
- redirect / pause behavior 유지
- final draft gating 유지
- notion labeling 유지

---

## Rollout Plan

### Phase 2A: dual-write foundation

- `ChallengeTicket` 타입 추가
- `DiscussionLedgerV2` 추가
- arrays를 source of truth로 유지하되 tickets도 동시에 채움
- artifact/UI는 계속 arrays 기반

### Phase 2B: structured output adoption

- coordinator `Section Outcome` / `Challenge Decisions` 추가
- reviewer normalized `Challenge:` grammar 추가
- parser는 새 block 우선, legacy fallback 유지

### Phase 2C: ticket-first runtime

- runtime source of truth를 tickets로 전환
- arrays는 derived view로만 유지
- handoff ordering과 cluster promotion 활성화

### Phase 2D: weak-consensus polish

- section당 1회 polish round 도입
- telemetry로 reopen rate / rounds-to-close 확인

---

## Risks

### 1. Scope creep

ticketization과 parser 강화가 동시에 들어가면 범위가 커질 수 있다.

완화:

- dual-write부터 시작
- legacy fallback 유지
- coordinator structured output을 먼저 넣고 reviewer normalization은 그 다음 단계로 나눌 수 있다.

### 2. Prompt brittleness

모델이 `Challenge Decisions` 형식을 어길 수 있다.

완화:

- parser는 tolerant하게 만들되, invalid line은 무시하고 legacy fallback 사용
- 테스트에 malformed structured output 케이스 추가

### 3. Weak-consensus over-triggering

advisory feedback가 많은 팀 구성일 때 polish round가 너무 자주 발생할 수 있다.

완화:

- section당 최대 1회
- reviewer 과반 `REVISE`일 때만
- 운영 중 telemetry를 보고 threshold 조정

---

## Acceptance Criteria

다음이 모두 만족되면 2차 설계가 성공한 것이다.

1. deferred handoff가 coordinator 자유문에 의존하지 않고 ticket cluster 기준으로 재현 가능하다.
2. reviewer `Challenge:` line에서 최소한 `ticketId`와 `close|keep-open|defer`를 안정적으로 추출할 수 있다.
3. `openChallenges`와 `deferredChallenges`는 ticket state에서 deterministic하게 다시 생성된다.
4. `BLOCK` 없는 advisory-heavy 상태는 section당 최대 1회의 polish round만 거친다.
5. realtime blind rule, redirect, pause, final draft gating, notion labeling regression이 없다.
6. 기존 1차 설계 artifact/UI와의 호환이 유지된다.

---

## Recommended File Targets

예상 수정 파일:

- `src/core/types.ts`
- `src/core/schemas.ts`
- `src/core/orchestrator.ts`
- `src/test/orchestrator.test.ts`
- `src/test/webviewProtocol.test.ts`
- `src/test/sidebarScript.test.ts`
- `src/webview/sidebarScript.ts`
- `docs/plans/<new phase 2 implementation note>.md`

주의:

- deepFeedback path는 건드리지 않는다.
- prompt / parser / runtime state transition을 한 patch에 모두 넣기 부담되면 phase rollout대로 쪼개서 적용한다.

---

## Recommended Name

repo에는 아래 파일명으로 두는 것을 권장한다.

`docs/plans/2026-04-02-realtime-ticketized-handoff-design.md`
