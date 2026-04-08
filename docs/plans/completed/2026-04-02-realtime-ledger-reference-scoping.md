# Realtime Ledger Reference Scoping Implementation Notes

## Goal

realtime review flow가 같은 이슈를 빙빙 돌지 않고, 현재 섹션을 닫은 뒤 deferred issue로 자연스럽게 넘어가도록 최소 수정으로 패치했다.

## Implemented Work

### 1. Ledger shape and artifacts

- `DiscussionLedger`와 Zod schema에 `deferredChallenges: string[]` 추가
- ledger prompt block과 `discussion-ledger.md` artifact에 `Deferred Challenges` 추가
- ledger parser가 `Deferred Challenges`를 읽도록 확장

### 2. Reviewer prompt scoping

- realtime reviewer prompt에 `Coordinator Reference`와 `Reviewer References` 도입
- previous-round reviewer ref는 current reviewer의 `participantId`와 같은 항목을 제외
- `Cross-feedback` instruction을 `[refId] agree|disagree` 형식으로 변경
- reviewer용 `Recent Discussion`은 coordinator turns만 보여주고 reviewer raw reply는 reference summary로만 전달

### 3. Realtime-specific objection extraction

- realtime reference summary는 `Challenge:` 우선
- 필요 시 `Cross-feedback:` 사용
- 마지막 fallback만 legacy extractor 사용
- `Mini Draft:`가 핵심 objection으로 재활용되지 않도록 조정

### 4. New convergence policy

- `APPROVE`: section-ready
- `REVISE`: advisory
- `BLOCK`: blocking

현재 section ready:

- `openChallenges.length === 0`
- active reviewer `BLOCK` 없음

whole document ready:

- current section ready
- `deferredChallenges.length === 0`

따라서 `REVISE`만 남은 상태에서는 section closure가 가능하고, `BLOCK`만 계속 hard blocker로 남는다.

### 5. Section handoff

- current section ready + deferred remain 상태에서는 final draft를 쓰지 않음
- 다음 round로 바로 handoff
- coordinator prompt에 deferred issue를 다음 `Target Section`으로 넘기라는 instruction 추가

### 6. Notion labeling

- 기존 placeholder normalization 재사용
- notion request descriptor 추가
- auto-generated request는 `## Auto Context Request`로 표기

### 7. UI follow-up

- live realtime ledger summary에 `후속 과제` 리스트 추가
- recent runs의 `discussion-ledger.md` artifact entry는 그대로 유지

## Actual File Changes

- `src/core/orchestrator.ts`
- `src/core/types.ts`
- `src/core/schemas.ts`
- `src/webview/sidebarScript.ts`
- `src/test/orchestrator.test.ts`
- `src/test/webviewProtocol.test.ts`
- `src/test/sidebarScript.test.ts`
- `src/test/contextCompiler.test.ts`

실제 구현에서는 `src/core/viewModels.ts`, `src/controller/sidebarStateStore.ts`, `src/webview/sidebarStyles.ts` 수정이 필요하지 않았다.

## Verification

핵심 검증 포인트는 아래 테스트로 커버했다.

- self-reference exclusion with duplicate reviewer slots
- coordinator / reviewer reference packet exposure
- challenge-first realtime summary extraction
- `REVISE` non-blocking section closure
- `BLOCK` still blocking
- deferred handoff delaying final draft
- auto notion request labeling
- realtime redirect / pause regression coverage
