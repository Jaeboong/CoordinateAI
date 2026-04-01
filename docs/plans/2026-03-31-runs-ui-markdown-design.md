# Runs UI Markdown Design

## Goal
`Runs` 화면을 디버그 로그 중심에서 실제 대화 중심으로 바꾼다. 완료된 AI 응답은 Markdown으로 읽기 좋게 렌더링하고, 시스템 이벤트는 별도 패널로 분리해 필요할 때만 보이게 한다.

## Approved Direction
- 완료된 메시지는 Markdown 렌더링
- 스트리밍 중인 메시지는 plain text 유지
- `Conversation`은 메인 영역으로 유지하고 가독성을 높임
- `System stream`은 더 작고 덜 눈에 띄게 유지
- `coordinator round 0`의 중간 조사 멘트는 메인 대화창에 누적하지 않고 마지막 조사 결과만 남김
- AI 메시지의 `to All` 같은 보조 정보는 줄이고 `speaker / role / round` 중심으로 보이게 함

## UX Notes
- 사용자는 메인 화면에서 `누가 어떤 의견을 냈는지`를 빠르게 읽을 수 있어야 한다.
- 시스템 이벤트는 완전히 숨기지 않는다. 다만 기본 시선은 대화 흐름에 머물러야 한다.
- Notion pre-pass는 필요한 기능이지만, 조사 중간 멘트가 여러 개 뜨면 채팅방처럼 보이지 않는다. 최종 `Notion Brief`만 남기는 편이 더 자연스럽다.

## Rendering Policy
- Streaming: 안전한 escaped plain text
- Completed: safe Markdown HTML
- Raw HTML: 허용하지 않음
- 우선 지원: 제목, 문단, 리스트, 강조, 인라인 코드, 코드블록, 링크

## Layout Policy
- `Conversation` 카드 상단에 짧은 설명과 함께 유지
- `Coordinator input pause`는 대화 바로 아래에 유지
- `System stream`은 기본 접힘 상태를 유지하되 높이와 시각적 존재감을 줄임
- 채팅 버블은 assistant/user/system 구분을 더 선명하게 함

## Implementation Scope
- `src/webview/sidebar.ts`
  - Markdown 렌더링 유틸 추가
  - 채팅 버블 렌더링 정책 변경
  - coordinator round 0 메시지 누적 정책 변경
  - 시스템 패널 스타일 정리
- `README.md`
  - Runs 화면 동작 설명 갱신

## Out of Scope
- 외부 Markdown 라이브러리 도입
- 완전한 GFM 호환
- 대화 타임라인 전체 재설계
- 실행 중 임의 시점 실시간 개입
