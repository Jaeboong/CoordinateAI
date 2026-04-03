# Section Drafter

`section_drafter.json`의 한국어 설명 문서다. 이 에이전트는 실제 자소서 section 문장을 쓰는 책임을 가진다.

## 역할 요약

- coordinator가 정의한 현재 objective를 실제 문장으로 바꾼다.
- research brief 안의 근거만 써서 자소서 문장을 작성한다.
- reviewer가 비평할 수 있는 초안을 만들어 토론을 다음 단계로 넘긴다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 버전
- `name`: 내부 이름
- `displayName`: 사람이 읽는 이름
- `kind`: 내부 subagent
- `role: "drafting"`: 문장 초안 작성 역할
- `description`: 한 줄 설명
- `mission`: 자소서 문장을 쓰는 방식에 대한 핵심 규칙

### execution

- `visibility: "internal"`: 사용자 직접 응대가 아니라 내부 drafting용이다.
- `interactionMode: "orchestrated"`: coordinator와 researcher가 만든 문맥 안에서 동작한다.
- `parallelSafe: false`: 같은 section을 동시에 여러 초안으로 충돌시키는 구조보다는 순차 drafting이 낫다.
- `writesFinalProse: true`: prose를 실제로 생성하는 역할이다.

### tools

- `allowed`: 비워 둔 이유는 raw source lookup을 금지하기 위해서다.
- `forbidden`: MCP나 local git 접근 없이 brief만 소비한다.

### inputs

- `required`
  - `essay_question`
  - `section_objective`
  - `research_brief`
  - `must_keep`
  - `must_resolve`
- `optional`
  - `previous_section_draft`
  - `word_limit`
  - `voice_constraints`
  - `user_guidance`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Section Draft`
  - `Change Rationale`
- `mustInclude`
  - `evidence_usage_summary`
  - `resolved_issues`
  - `remaining_risks`

### constraints

- `forbiddenActions`
  - research brief 밖의 주장 추가 금지
  - 모르는 내용을 상상으로 메우기 금지
  - 사실 정밀도보다 문장 멋을 우선하는 행동 금지
  - coordinator의 스코프 무시 금지
- `requiredBehaviors`
  - 가장 강한 안전 근거부터 사용
  - 추상적 자기찬양보다 구체적 행동과 책임을 우선
  - 경험과 문항 의도의 연결고리를 문장 안에서 드러낼 것
  - 약한 지점은 rationale에서 숨기지 말고 드러낼 것

### success

- 초안이 메모가 아니라 실제 자소서 문장처럼 읽혀야 한다.
- 핵심 주장을 다시 evidence로 추적할 수 있어야 한다.
- current objective를 직접 다뤄야 한다.
- reviewer가 구조 부재보다 fit, evidence, voice에 집중할 수 있어야 한다.

## 개발 메모

- `section_drafter`는 창의적 문장 생성기처럼 보이지만 실제로는 강하게 constrained된 writer다.
- 런타임에서는 `mustKeep`, `mustResolve`, `voiceConstraints`를 prompt 상단에 분명히 주는 편이 품질이 안정적일 가능성이 높다.
- 이후 variant가 필요하면 `draftMode` 같은 필드를 추가해 first draft / rewrite / compression을 나눌 수 있다.
