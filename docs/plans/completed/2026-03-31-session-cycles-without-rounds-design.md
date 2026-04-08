# Session Cycles Without Rounds Design

## Goal
`Runs`를 고정 라운드 수 기반 실행에서, 사용자가 원할 때까지 계속 이어가는 세션형 cycle 구조로 바꾼다.

## UX Direction
- 시작 시 `Rounds` 입력을 제거한다.
- 실행 단위는 `review cycle`이다.
  - reviewer들 피드백
  - coordinator가 현재 `summary / improvement plan / revised draft` 갱신
  - pause
- pause에서는:
  - 빈 입력 + `Enter`: 다음 cycle 계속
  - 메모 입력 + `Enter`: 그 메모를 다음 cycle의 가이드로 반영
  - `/done` 입력: 현재까지의 결과를 유지한 채 세션 종료
- 별도 `Final synthesis` 버튼은 두지 않는다.

## Orchestrator Behavior
- `RunRequest.rounds`는 UI에서는 더 이상 받지 않지만, 비대화형 호출과 기존 테스트 호환을 위해 내부 필드로 유지한다.
- interactive run (`requestUserIntervention` 존재)에서는 `rounds`를 종료 조건으로 쓰지 않는다.
- non-interactive run에서는 기존처럼 `rounds`만큼 cycle을 돌고 자동 종료한다.
- 각 cycle이 끝날 때마다:
  - `compiled-context.md` 갱신
  - `summary.md`, `improvement-plan.md`, `revised-draft.md` 갱신
  - `RunRecord.rounds`를 현재 완료 cycle 수로 업데이트

## Draft Handling
- coordinator가 만든 `revised draft`를 다음 cycle의 `Current Draft`로 사용한다.
- 즉 세션이 진행될수록 reviewers는 최신 초안을 보고 다시 피드백한다.

## Prompt Shape
- reviewer prompt
  - 현재 compiled context
  - 최신 Notion brief
  - 최신 session snapshot (summary / improvement plan / revised draft)
  - user guidance history
- coordinator prompt
  - 현재 cycle reviewer discussion
  - 최신 session snapshot
  - user guidance history

## Data Compatibility
- 기존 `RunRecord.rounds` 필드는 유지하고 의미를 `completed cycles`로 재해석한다.
- 기존 run artifact 형식은 유지한다.
- 기존 continue-from-run 기능도 유지한다.

## Testing
- non-interactive mode는 여전히 deterministic 하게 종료되어 기존 테스트 기반을 유지한다.
- interactive mode는 `/done`이 들어오면 종료되는 새 테스트를 추가한다.
- blank input은 계속 진행하는 동작을 검증한다.
