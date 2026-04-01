# Continue Run Design

## Goal
이전 run에서 나온 논의와 결과물을 기반으로 새 run을 시작해, 사용자가 GPT/Claude 대화처럼 "이어서" 작업하는 느낌을 받을 수 있게 한다.

## Approved Direction
- provider 고유 세션 복원이 아니라 `앱 레벨 이어쓰기`로 구현한다.
- 이전 run은 그대로 보존하고, 이어서 시작한 run은 새 run으로 저장한다.
- `Continue`를 누르면 이전 run의 질문/노션 요청/선택 문맥을 새 run 폼에 기본값으로 불러온다.
- 새 run의 prompt에는 이전 run의 핵심 결과를 `Previous Run Context` 섹션으로 주입한다.

## UX Policy
- Recent runs에 `Continue` 버튼을 추가한다.
- `Continue`를 누르면 Runs 폼 상단에 `Continuing from <run id>` 카드가 뜬다.
- 사용자는 그대로 실행할 수도 있고, 질문/초안/노션 요청을 수정한 뒤 실행할 수도 있다.
- 이어쓰기 상태를 취소할 수 있는 `Clear` 동작을 둔다.

## Context Carryover Policy
- 이전 run에서 다음 정보를 새 run 컨텍스트에 넣는다.
  - 이전 질문
  - 이전 초안
  - 이전 summary
  - 이전 improvement plan
  - 이전 revised draft
  - 이전 notion brief
  - 이전 대화의 마지막 핵심 발화 일부
- 사용자가 이번 run에서 수정한 현재 질문/현재 초안이 최우선이며, 이전 run 정보는 참고 맥락으로만 사용한다.

## Scope
- `Continue` 버튼 추가
- 이어쓰기 preset 로드
- 새 run input/record에 continuation 메타데이터 저장
- 오케스트레이터가 이전 run 컨텍스트를 새 prompt에 포함

## Out of Scope
- Codex/Claude/Gemini 고유 thread/session 복원
- 여러 이전 run을 병합해 이어쓰기
- 자동 요약 재생성
