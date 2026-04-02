# Realtime Ledger Reference Scoping Design

## Summary

realtime review flow가 같은 이슈를 반복하지 않고 현재 섹션을 닫아가도록, reviewer reference packet과 section-scoped ledger를 도입했다. 구현 기준 source of truth는 현재 코드이며, deepFeedback 경로는 건드리지 않았다.

## Shipped Decisions

### 1. Section-scoped ledger

`DiscussionLedger`는 아래 필드를 가진다.

- `currentFocus`
- `targetSection`
- `miniDraft`
- `acceptedDecisions`
- `openChallenges`
- `deferredChallenges`
- `updatedAtRound`

의미는 다음과 같다.

- `openChallenges`: 현재 `Target Section`을 닫지 못하게 막는 blocker
- `deferredChallenges`: 다음 섹션 또는 마지막 polish로 넘길 후속 과제

ledger markdown과 artifact에도 `Deferred Challenges`를 함께 기록한다.

### 2. Reviewer reference packet

realtime reviewer prompt는 자유형 `Previous Round Reviewer Summary` 의존 대신 아래 블록을 사용한다.

- `## Coordinator Reference`
- `## Reviewer References`
- `## Discussion Ledger`
- `## Recent Discussion`

reference entry는 모두 아래 형식을 따른다.

- `refId`
- `sourceLabel`
- `summary`

예시:

- `coord-r1`
- `rev-r1-reviewer-1`
- `rev-r1-reviewer-2`

`Reviewer References`는 현재 reviewer 자신의 `participantId`와 같은 previous-round reviewer ref를 제외한다. duplicate provider slot이 있어도 `reviewer-1`, `reviewer-2` 단위로 정확히 제외한다.

`Coordinator Reference`는 가능하면 직전 coordinator round를 가리키고, 이전 coordinator turn이 없을 때만 현재 ledger를 fallback으로 사용한다.

### 3. Realtime objection extraction

realtime reviewer summary는 별도 extractor를 사용한다.

우선순위:

1. `Challenge:`
2. `Cross-feedback:`
3. legacy fallback

즉, `Mini Draft:` 문장이 직전 reviewer objection의 대표 요약으로 다시 올라오지 않도록 한다.

또한 reviewer prompt의 `Recent Discussion`은 coordinator 흐름만 보여주고, 이전 reviewer 원문 응답은 reference packet 요약으로만 노출한다. 이렇게 해야 blind rule을 유지하면서도 같은 reviewer가 자신의 이전 응답 원문에 다시 끌려가지 않는다.

### 4. Realtime status semantics

status vocabulary는 유지한다.

- `APPROVE`
- `REVISE`
- `BLOCK`

의미는 다음으로 바뀐다.

- `APPROVE`: 현재 방향은 section-ready
- `REVISE`: 개선 권고이지만 section closure를 막지 않음
- `BLOCK`: 현재 section을 닫으면 안 됨

### 5. Convergence policy

현재 section ready 조건:

- `openChallenges.length === 0`
- 활성 reviewer 중 `BLOCK` 없음

whole document ready 조건:

- current section ready
- `deferredChallenges.length === 0`

따라서 `REVISE`만 남아 있고 `openChallenges`가 비어 있으면 현재 section은 닫을 수 있다. final draft는 `deferredChallenges`까지 비워져야만 작성된다.

### 6. Section handoff

현재 section이 ready인데 `deferredChallenges`가 남아 있으면 final draft를 쓰지 않는다. 대신 다음 round로 넘어가고, coordinator prompt는 이전 ledger의 `Deferred Challenges`를 보고 다음 `Target Section`을 그쪽으로 handoff하도록 유도한다.

이번 patch에서는 별도 ticket system을 만들지 않았고, `string[]` 기반 deferred issue handoff만 구현했다.

### 7. Groupthink guard

devil's advocate 경로는 계속 유지하되, 아래 조건에서만 발동한다.

- 모든 active reviewer가 `APPROVE`
- minimum round 이전

`APPROVE + REVISE` 혼합 상태는 false consensus로 간주하지 않는다.

### 8. Notion request labeling

punctuation-only `notionRequest` 정규화는 기존 `normalizeNotionRequest()`를 그대로 재사용했다.

새로 추가한 것은 in-memory descriptor다.

- `text`
- `kind: "explicit" | "implicit" | "auto"`

pre-pass prompt heading은 아래처럼 바뀐다.

- explicit / implicit: `## User Notion Request`
- auto: `## Auto Context Request`

즉, project의 linked page에서 자동 생성된 fetch request가 user-authored request처럼 보이지 않는다.

## Files Touched

- `src/core/orchestrator.ts`
- `src/core/types.ts`
- `src/core/schemas.ts`
- `src/webview/sidebarScript.ts`
- `src/test/orchestrator.test.ts`
- `src/test/webviewProtocol.test.ts`
- `src/test/sidebarScript.test.ts`

추가로 repo 최신 상태 기준 compile blocker를 해소하기 위해 `src/test/contextCompiler.test.ts`의 readonly fixture도 함께 정리했다.

## Non-goals Kept

- same-round blind review rule 유지
- markdown 기반 output 유지
- interactive pause / redirect behavior 유지
- deepFeedback redesign 미실시
