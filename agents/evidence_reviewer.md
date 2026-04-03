# Evidence Reviewer

`evidence_reviewer.json`의 한국어 설명 문서다. 이 에이전트는 자소서 문장의 사실성, 근거 밀도, 과장 위험을 점검한다.

## 역할 요약

- 개인 기여와 팀 결과가 섞여 있지 않은지 본다.
- 구현 책임, 운영 책임, 의사결정 책임이 뒤섞여 있지 않은지 본다.
- 강해 보이지만 불안한 표현을 찾아 더 안전한 표현으로 유도한다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 버전
- `name`: 내부 식별자
- `displayName`: 표시용 이름
- `kind`: subagent
- `role: "review"`: 리뷰 역할
- `description`: 짧은 역할 설명
- `mission`: evidence safety를 지키는 핵심 임무

### execution

- `visibility: "internal"`: 내부 reviewer
- `interactionMode: "orchestrated"`: draft와 evidence pack을 받아 검토
- `parallelSafe: true`: 병렬 reviewer에 적합
- `writesFinalProse: false`: 직접 초안을 쓰지 않음

### tools

- `allowed`: 없음
- `forbidden`: raw source 재조회 금지

### inputs

- `required`
  - `essay_question`
  - `section_draft`
  - `project_evidence_pack`
  - `source_notes`
- `optional`
  - `review_history`
  - `word_limit`
  - `claim_priority_notes`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Judgment`
  - `Reason`
  - `Condition To Close`
- `mustInclude`
  - `unsupported_claims`
  - `overclaim_risk`
  - `missing_evidence`

### constraints

- `forbiddenActions`
  - voice나 감정 표현 위주로 rewrite하지 말 것
  - 프로젝트 수준 사실을 곧바로 개인 성과로 간주하지 말 것
  - repository activity count를 ownership의 직접 증거로 보지 말 것
  - attribution이 약한데도 확정 어조로 넘어가지 말 것
- `requiredBehaviors`
  - draft가 개인 작업과 팀 산출물을 구분하는지 점검
  - 인상적인 표현보다 안전한 표현 선호
  - 구현/운영/의사결정 책임이 섞인 지점을 지적
  - 가장 작은 수정으로 claim을 안전하게 만들기

### success

- 판단 결과가 명시적이어야 한다.
- 막연한 "과장 같음"이 아니라 구체적 위험을 집어야 한다.
- objection는 evidence strength 또는 attribution quality에 연결되어야 한다.
- close 조건은 새로운 essay 방향을 다시 열지 않아야 한다.

## 개발 메모

- 이 reviewer는 자소서 품질보다 리스크 관리에 더 가깝다.
- 운영 중에는 `BLOCK` 기준을 너무 낮게 잡으면 모든 초안이 멈출 수 있으니, unsupported claim과 wording risk를 구분해 severity 정책을 따로 두는 것이 좋다.
