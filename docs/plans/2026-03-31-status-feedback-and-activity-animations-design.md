# Status Feedback And Activity Animations Design

## Goal
webview 상단 배너와 대화 중 상태 표시를 정리해서, 사용자가 "지금 뭔가 작동 중인지"를 즉시 알 수 있게 만든다.

## UX Direction
- 상단 상태 영역은 `한 번에 1개만` 크게 보여준다.
- 새로운 알림이 여러 개 생기면 현재 표시 아래에 `+N queued`만 보인다.
- `busyMessage`가 있으면 그것이 최우선 active 상태가 된다.
- 버튼 클릭 직후에는 해당 버튼에 작은 로딩 표시를 붙여 "눌렸음"을 즉시 보여준다.
- AI turn 시작 후 첫 자연어 메시지 전까지는 `Thinking…`
- 자연어가 스트리밍되기 시작하면 `Writing…`
- 상태 표시는 메인 대화창을 방해하지 않도록 conversation 상단의 작은 chip/row 형태로 둔다.

## Visual Direction
- 현재 UI 톤을 유지하되, 상태 표시만 더 살아 있게 만든다.
- 애니메이션은 과하지 않게:
  - 점 3개가 흐르는 ellipsis
  - 작은 spinner/pulse
  - subtle shimmer

## Behavior Rules
- active banner
  - 우선순위: workspace error > busy > latest banner
- queued count
  - active가 아닌 banner 메시지 수만 센다.
- busy가 끝나면 최신 completion banner가 자연스럽게 보이게 한다.
- turn-started → provider status `thinking`
- first chat-message-started/delta → provider status `writing`
- chat-message-completed or turn-completed/failed → provider status 제거

## Scope
- `sidebar.ts`만으로 처리 가능한 범위에서 구현한다.
- extension/backend 이벤트 스키마는 가능한 유지한다.
