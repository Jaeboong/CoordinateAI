# Duplicate Provider Slots Design

## Goal
`Runs` 탭의 provider 선택 UI를 `Coordinator 1개 + Reviewer 1개 이상` 구조로 바꾸고, coordinator/reviewer 양쪽에서 같은 provider를 여러 번 선택할 수 있게 한다.

## Approved Direction
- coordinator는 단일 select로 고정
- reviewer는 동적 행 리스트로 렌더링
- reviewer는 최소 1명, 필요하면 `Add reviewer`로 추가
- 같은 provider를 여러 행에서 반복 선택 가능
- 극단적으로 `Codex coordinator + Codex reviewer 1 + Codex reviewer 2 + Codex reviewer 3`도 허용

## Main Constraint
현재 런타임은 reviewer를 `providerId`로 식별한다. 그래서 `codex` reviewer가 2명 이상이면:
- realtime 승인 상태가 하나로 합쳐지고
- turn/message activity가 서로 덮어쓰이며
- conversation에서 누가 누구인지 구분하기 어렵다

따라서 이번 변경은 UI만이 아니라 실행 중 식별자도 슬롯 기반으로 바꿔야 한다.

## Architecture
- 저장 포맷은 최대한 유지한다.
  - `RunRecord.coordinatorProvider`
  - `RunRecord.reviewerProviders[]`
- 실행 시에만 슬롯 객체를 파생한다.
  - coordinator: `coordinator`
  - reviewers: `reviewer-1`, `reviewer-2`, ...
- 각 슬롯은 `providerId`와 별도로 `participantId`, `participantLabel`을 가진다.
- 이벤트, turn, chat message, realtime consensus는 `providerId`가 아니라 `participantId` 기준으로 추적한다.

## UX
- `Select providers` 체크박스 그리드는 제거
- `Coordinator` select는 유지하되 reviewer와 분리
- `Reviewers` 섹션에서 행마다 provider select + remove button 제공
- reviewer가 1명뿐일 때 remove 비활성
- recent run continuation은 기존 `reviewerProviders[]`를 바탕으로 reviewer 행을 그대로 복원

## Labels
- coordinator: `Codex coordinator`
- reviewer:
  - 단일 reviewer면 `Codex reviewer`
  - 중복 provider가 둘 이상이면 `Codex reviewer 1`, `Codex reviewer 2`
- chat 색상은 기존처럼 provider 색을 그대로 사용

## Runtime Rules
- distinct healthy provider 수가 아니라 `healthy coordinator 1 + healthy reviewer 1 이상`이면 실행 가능
- 같은 provider를 여러 슬롯에 써도 순차 실행이므로 허용
- realtime consensus는 활성 reviewer 슬롯 전원이 `APPROVE`일 때만 성립

## Testing
- webview protocol은 기존 shape 유지 여부 확인
- webview script smoke test에 reviewer row UI 문자열 추가
- orchestrator 테스트:
  - duplicate reviewer providers 허용
  - duplicate reviewer status가 slot별로 분리 추적
  - duplicate reviewer prompts/message scopes가 slot별로 달라짐
