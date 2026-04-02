# Realtime Ledger Reference Scoping Design

## Summary

현재 realtime ledger 흐름은 `Mini Draft` 중심 수렴에는 성공했지만, 두 가지 구조 문제가 드러났다.

- reviewer의 `Cross-feedback`가 자기 자신의 직전 objection을 참조할 수 있다.
- `Target Section`과 무관한 후속 과제도 `Open Challenges`에 남아 현재 섹션 수렴을 불필요하게 막는다.

이번 수정에서는 `참조 대상 패킷(reference packet)`과 `section-scoped challenges`를 도입해, reviewer가 코디네이터 또는 다른 reviewer만 참조하게 만들고, 현재 섹션 blocker와 후속 과제를 분리한다.

## Goals

- reviewer의 `Cross-feedback`가 자기 자신을 참조하지 못하게 한다.
- reviewer가 코디네이터 또는 타 reviewer의 직전 핵심 objection에만 명시적으로 반응하게 한다.
- `Open Challenges`를 현재 `Target Section` blocker로 한정한다.
- 현재 섹션과 무관한 후속 과제는 별도 bucket으로 관리해 현재 섹션 합의를 막지 않게 한다.
- `notionRequest`가 `"."` 같은 placeholder일 때 어색한 pre-pass 설명이 나오지 않게 한다.

## Non-goals

- realtime blind rule을 깨고 같은 라운드 다른 reviewer 응답을 실시간으로 전부 노출하지 않는다.
- `심화 피드백` 경로는 이번 수정 범위에 포함하지 않는다.
- reviewer 응답을 완전 structured JSON으로 강제하지 않는다.

## Chosen Approach

### 1. Reference Packet

realtime reviewer prompt에 자유형 요약 대신 명시적 참조 블록을 제공한다.

- `Coordinator Reference`
- `Reviewer References`

각 reference는 아래 정보를 가진다.

- `refId`
- `sourceLabel`
- `summary`

예시:

- `coord-r3`
- `rev-r3-reviewer-1`
- `rev-r3-reviewer-2`

현재 reviewer 자신의 `participantId`와 매칭되는 reviewer reference는 prompt에서 제외한다. 따라서 reviewer는 자기 자신의 직전 objection을 참조할 수 없다.

`Cross-feedback`는 아래 형식으로 좁힌다.

- `Cross-feedback: [refId] agree ...`
- `Cross-feedback: [refId] disagree ...`

round 1 또는 이전 reviewer reference가 없을 때는 coordinator reference만 허용한다.

### 2. Section-Scoped Challenges

ledger 필드를 다음처럼 재정의한다.

- `openChallenges`: 현재 `Target Section`을 finalize하지 못하게 막는 쟁점만 포함
- `deferredChallenges`: 이후 섹션 또는 마지막 polish 단계에서 다룰 후속 과제

즉 `Target Section`이 `직무 지원 이유`일 때 `마지막 포부 문단 구체화`는 `openChallenges`가 아니라 `deferredChallenges`로 이동해야 한다.

### 3. Coordinator Update Rules

코디네이터는 매 라운드 ledger를 갱신할 때 다음 규칙을 따른다.

- 현재 `Target Section` blocker만 `openChallenges`에 남긴다.
- 섹션 밖 이슈는 `deferredChallenges`로 이동한다.
- `openChallenges`가 비면 현재 섹션은 수렴 상태로 본다.
- `deferredChallenges`가 남아 있으면 다음 라운드에서 `Target Section`을 전환하거나, 마지막 polish 단계 전까지 계속 추적한다.

### 4. Finalization Rules

- 현재 섹션 consensus 조건: 활성 reviewer 전원 `APPROVE` + `openChallenges` 비어 있음
- 최종 draft 작성 조건: 활성 reviewer 전원 `APPROVE` + `openChallenges` 비어 있음 + `deferredChallenges`도 비어 있음

즉, 현재 섹션은 수렴할 수 있어도 전체 문서는 아직 finalize되지 않을 수 있다.

### 5. Notion Placeholder Handling

`notionRequest`가 아래 조건이면 explicit user request로 취급하지 않는다.

- 빈 문자열
- `"."`
- `"..."` 또는 구두점만 있는 값

이 경우:

- pre-pass를 스킵하거나
- 자동 탐색이 필요하면 `User Notion Request` 대신 `Auto Context Request` 같은 라벨을 사용한다.

## Prompt Flow Changes

### Reviewer Prompt

realtime reviewer prompt는 아래 블록을 포함한다.

- `Discussion Ledger`
- `Coordinator Reference`
- `Reviewer References`
- `Recent Discussion`

응답 규칙은 아래로 바꾼다.

- `Mini Draft:` 현재 mini draft의 특정 구절/문장을 유지 또는 수정
- `Challenge:` `openChallenges` 중 하나를 닫을지 유지할지 판단
- `Cross-feedback:` 제공된 reference packet 중 하나에만 명시적으로 반응
- `Status: APPROVE|REVISE|BLOCK`

### Coordinator Prompt

코디네이터는 기존 ledger 출력에 `Deferred Challenges`를 추가한다.

- `Current Focus`
- `Target Section`
- `Mini Draft`
- `Accepted Decisions`
- `Open Challenges`
- `Deferred Challenges`

프롬프트에도 현재 섹션 blocker만 `Open Challenges`에 남기라는 규칙을 넣는다.

## Persistence and UI

- `discussion-ledger.md` artifact에 `Deferred Challenges`를 함께 저장한다.
- Conversation 카드 live ledger 요약에는 우선 `현재 초점 / 미니 초안 / 남은 쟁점`을 유지하되, 필요하면 `후속 과제`도 작은 리스트로 노출할 수 있다.
- recent runs 버튼은 그대로 `토론 상태 열기`를 유지한다.

## Error Handling

- reviewer reference packet이 비면 `Cross-feedback`는 coordinator reference만 허용한다.
- coordinator가 `deferredChallenges`를 비워서 반환해도 기존 ledger를 무조건 덮지 말고, section 전환 의도와 함께 해석한다.
- placeholder notion request는 explicit request로 기록하지 않아, `Resolution`에 "요청이 .로 비어 있었다" 같은 문구가 남지 않게 한다.

## Testing

- reviewer prompt에 자기 자신의 reviewer reference가 포함되지 않는지 검증한다.
- reviewer prompt에 coordinator reference와 타 reviewer reference가 함께 들어가는지 검증한다.
- round 1 또는 reviewer 1명일 때는 coordinator reference만 cross-feedback 대상으로 제공되는지 검증한다.
- `Target Section` 밖 이슈가 `Open Challenges`가 아니라 `Deferred Challenges`로 내려가는지 검증한다.
- `Deferred Challenges`가 남아 있으면 현재 섹션 consensus는 가능하지만 final draft는 막히는지 검증한다.
- placeholder notion request가 어색한 resolution 문구를 만들지 않는지 검증한다.
