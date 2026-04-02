# Realtime Discussion Ledger Design

## Summary

현재 `실시간 대화형`은 코디네이터가 방향만 제시하고 리뷰어가 각자 승인/수정만 반복하는 구조라, 같은 고수준 피드백이 여러 라운드에 걸쳐 반복되기 쉽다. 이 변경에서는 코디네이터가 매 라운드 `짧은 수정 초안(mini draft)`과 `누적 토론 상태 ledger`를 갱신하고, 리뷰어는 그 초안과 직전 라운드의 핵심 objection에 교차 피드백하도록 바꾼다.

## Goals

- `실시간 대화형` 토론이 추상 방향 반복에서 실제 문장 수렴으로 이어지게 한다.
- 코디네이터가 매 라운드 현재 초점과 수정 초안을 짧게 제시하게 한다.
- 리뷰어가 코디네이터에게만 반응하지 않고, 직전 라운드 reviewer 의견에도 명시적으로 동의/반박하게 한다.
- 현재 토론 상태를 `ledger`로 저장해 다음 프롬프트와 UI에서 같은 기준점을 공유하게 한다.

## Non-goals

- `심화 피드백` 모드의 구조를 이번 변경에서 바꾸지 않는다.
- provider CLI의 세션 복원 기능을 직접 연결하지 않는다.
- 자유 채팅처럼 모든 리뷰어가 같은 라운드에 서로의 응답을 실시간으로 모두 보게 만들지 않는다.

## Chosen Approach

`코디네이터 미니 초안 + 누적 ledger + 직전 라운드 교차 피드백` 방식을 사용한다.

- 코디네이터는 매 라운드마다 `Current Focus`, `Mini Draft`, `Accepted Decisions`, `Open Challenges`를 가진 ledger를 갱신한다.
- 리뷰어는 직전 라운드까지의 ledger와 최근 discussion history를 보고, `Mini Draft`의 어느 부분을 유지/수정할지 구체적으로 답한다.
- 리뷰어 프롬프트에는 같은 라운드 다른 리뷰어 응답을 여전히 숨기되, `직전 라운드 요약`과 `Open Challenges`를 통해 서로의 핵심 쟁점에는 반응하게 만든다.
- 최종본 작성은 `Open Challenges`가 정리되고 활성 리뷰어 전원의 `Status: APPROVE`가 모였을 때만 허용한다.

## Why Not CLI Session Memory

Codex, Claude, Gemini CLI 모두 자체 세션/재개 기능은 있지만, 현재 ForJob는 각 턴을 새 프로세스로 `prompt`를 통째로 넘기는 구조다. 따라서 이번 기능은 CLI 고유 메모리에 기대지 않고, 앱이 직접 유지하는 명시적 토론 상태를 기반으로 구현한다. 이렇게 해야 중복 reviewer slot, provider별 차이, 재현 가능한 디버깅 문제를 피할 수 있다.

## Ledger Shape

ledger는 최소한 아래 필드를 가진다.

- `currentFocus`: 이번 라운드에서 가장 먼저 해결해야 할 한 줄 요약
- `miniDraft`: 코디네이터가 제안하는 2~4문장 수준의 짧은 수정 초안
- `acceptedDecisions`: 현재까지 reviewer들이 사실상 합의한 수정 방향 목록
- `openChallenges`: 아직 해결되지 않은 objection 목록
- `targetSection`: 초안의 어느 문단/문장에 집중하는지에 대한 짧은 라벨
- `updatedAtRound`: ledger가 마지막으로 갱신된 라운드 번호

이 상태는 메모리 안에서 다음 프롬프트 조립에 사용하고, 실행 결과 artifact로도 저장한다.

## Prompt Flow

### Round 1

- 코디네이터는 기존처럼 핵심 쟁점을 열되, 마지막에 짧은 `Mini Draft`를 포함한 ledger를 함께 제안한다.
- 리뷰어는 초안/Notion brief/ledger를 보고 각자 첫 반응을 남긴다.

### Round 2+

- 코디네이터는 직전 라운드 reviewer responses를 읽고 ledger를 업데이트한다.
- `accepted decisions`에는 반복적으로 동의된 지점만 남기고,
- `open challenges`에는 아직 `REVISE/BLOCK`가 남는 지점만 남긴다.
- 리뷰어는 다음 규칙으로 답한다.
  - `Mini Draft`에서 유지할 한 부분 또는 수정이 필요한 한 부분을 구체적으로 지목한다.
  - `Open Challenges` 중 하나를 닫을지 유지할지 판단한다.
  - 직전 라운드 다른 reviewer의 핵심 objection 1개에는 명시적으로 동의/반박한다.
  - 마지막 줄은 기존과 동일하게 `Status: APPROVE|REVISE|BLOCK`를 유지한다.

### Finalization

- 활성 reviewer 전원이 `APPROVE`이면 코디네이터가 `Mini Draft`, `Accepted Decisions`, `최근 논의`를 바탕으로 장문 최종본을 쓴다.
- 만장일치가 아니면 기존 realtime safety stop 규칙을 유지한다.

## Persistence and UI

- 새 artifact `discussion-ledger.md`를 저장한다.
- recent runs 목록에 `토론 상태 열기` 버튼을 추가할 수 있게 artifact flag를 노출한다.
- 현재 실행 중에는 Conversation 카드 안에 `현재 초점 / 미니 초안 / 남은 쟁점` 요약 박스를 렌더한다.
- live UI 갱신은 별도 `runEvent` 타입 또는 state payload 확장 중 더 작은 변경 범위를 택해 연결한다.

## Error Handling

- 코디네이터가 ledger를 비워서 반환하면, 마지막 유효 ledger를 유지하고 현재 라운드의 원문 응답은 채팅에는 그대로 남긴다.
- 리뷰어가 교차 피드백 규칙을 제대로 지키지 않아도 `Status` 파싱은 기존 방식대로 동작하게 유지한다.
- ledger artifact 저장 실패가 전체 실행 실패로 번지지 않도록, artifact 저장과 final draft 저장은 구분해서 다룬다.

## Testing

- 오케스트레이터 테스트로 `Mini Draft`와 `Open Challenges`가 후속 reviewer prompt에 실제로 포함되는지 검증한다.
- reviewer prompt가 직전 라운드 교차 피드백 규칙을 포함하는지 검증한다.
- realtime 합의 후 `discussion-ledger.md`가 저장되는지 검증한다.
- webview 테스트로 live ledger 요약 박스와 recent run artifact 버튼이 렌더되는지 확인한다.
