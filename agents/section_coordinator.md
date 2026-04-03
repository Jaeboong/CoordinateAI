# Section Coordinator

`section_coordinator.json`의 한국어 설명 문서다. 이 에이전트는 자소서 작성 토론에서 진행자 역할만 맡고, 실질적인 조사나 긴 초안 작성은 맡지 않는다.

## 역할 요약

- 현재 어떤 section을 다루는지 선언한다.
- 이번 라운드에서 꼭 해결해야 할 쟁점을 선택한다.
- 현재 section을 닫을 수 있는지 판단한다.
- 다음 작업 owner를 지정한다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 파일 버전
- `name`: 내부 식별자
- `displayName`: 표시용 이름
- `kind`: 내부 위임형 에이전트
- `role: "orchestration"`: 조정과 handoff를 담당함
- `description`: 짧은 역할 설명
- `mission`: 운영자로서의 핵심 임무 설명

### execution

- `visibility: "internal"`: 사용자 직접 응대용이 아니라 내부 오케스트레이션용이다.
- `interactionMode: "orchestrated"`: 전체 파이프라인 상태를 받아 동작한다.
- `parallelSafe: false`: 같은 section에서 동시에 여러 coordinator를 돌리는 구조와는 맞지 않는다.
- `writesFinalProse: false`: prose 작성 책임이 없다.

### tools

- `allowed`: 비워 둔 이유는 raw source lookup을 하지 말아야 하기 때문이다.
- `forbidden`: GitHub, Notion, DART, local git, direct user chat을 모두 막아 두었다.

### inputs

- `required`
  - `essay_question`
  - `current_section`
  - `discussion_state`
  - `research_brief`
  - `latest_section_draft`
  - `reviewer_feedback`
- `optional`
  - `word_limit`
  - `user_override`
  - `continuation_note`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Current Section`
  - `Current Objective`
  - `Must Keep`
  - `Must Resolve`
  - `Available Evidence`
  - `Exit Criteria`
  - `Next Owner`
- `mustInclude`
  - `section_scope`
  - `active_ticket`
  - `closure_conditions`

### constraints

- `forbiddenActions`
  - 새 사실 조사 금지
  - 긴 문단 초안 작성 금지
  - research brief에 없는 주장 끼워 넣기 금지
  - reviewer들의 렌즈를 뭉뚱그린 모호한 비평 금지
- `requiredBehaviors`
  - 한 번의 drafting으로 처리 가능한 범위로 objective를 좁힐 것
  - section close를 막는 blocker를 정확히 이름 붙일 것
  - evidence는 참조하되 해석을 과장하지 말 것
  - 다음 owner를 명시할 것

### success

- 다음 agent가 무엇을 해야 하는지 추측하지 않아도 된다.
- section 종료 조건이 명시적이어야 한다.
- coordinator 출력으로 새 evidence가 유입되면 안 된다.
- 재개와 handoff가 쉬운 상태를 남겨야 한다.

## 개발 메모

- 기존 구조의 문제는 coordinator가 초안까지 써버려 reviewer를 편집자로 만들어버린 점이었다.
- 그래서 이 파일은 일부러 도구 접근도 없고 prose 책임도 없다.
- 런타임에서 coordinator 프롬프트를 만들 때는 "결정과 운영"만 남기고, "작성"과 "조사"는 다른 에이전트로 분리해야 이 설계 의도가 유지된다.
