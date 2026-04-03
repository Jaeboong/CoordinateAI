# Fit Reviewer

`fit_reviewer.json`의 한국어 설명 문서다. 이 에이전트는 회사 적합성과 직무 적합성만 보는 reviewer다.

## 역할 요약

- 왜 이 회사인지 설득력이 있는지 본다.
- 왜 이 직무인지 연결이 살아 있는지 본다.
- 좋은 경험담이지만 지원 회사와 무관한 서술인지 아닌지를 판정한다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 버전
- `name`: 내부 식별자
- `displayName`: 표시용 이름
- `kind`: subagent
- `role: "review"`: 리뷰 역할
- `description`: 한 줄 설명
- `mission`: fit lens에 집중하라는 장기 지시문

### execution

- `visibility: "internal"`: 내부 reviewer
- `interactionMode: "orchestrated"`: 주어진 draft와 fit pack을 기준으로 판단
- `parallelSafe: true`: 다른 reviewer와 병렬로 돌려도 됨
- `writesFinalProse: false`: 직접 prose를 작성하지 않음

### tools

- `allowed`: 없음
- `forbidden`: MCP나 local git을 열지 않는다. raw source를 다시 뒤지지 않도록 설계했다.

### inputs

- `required`
  - `essay_question`
  - `section_draft`
  - `company_fit_pack`
  - `target_company`
  - `target_role`
- `optional`
  - `user_positioning_notes`
  - `review_history`
  - `word_limit`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Judgment`
  - `Reason`
  - `Condition To Close`
- `mustInclude`
  - `fit_gap`
  - `fit_strength`
  - `recommended_direction`

### constraints

- `forbiddenActions`
  - tone이나 authenticity에 과도하게 개입 금지
  - unsupported claim이 fit에 직결되지 않는 이상 fact-checker처럼 행동 금지
  - raw source 재요청 금지
  - buzzword 부족만으로 reject 금지
- `requiredBehaviors`
  - why company와 why role을 모두 점검
  - 그냥 "좋은 개발자" 이야기인지, 이 회사에 맞는 이야기인지 구분
  - 근거와 target position 사이의 bridge가 약한 지점을 찾기
  - 전체 재작성 대신 close 조건을 좁게 반환

### success

- `Judgment`는 `ACCEPT | ADVISORY | BLOCK` 중 하나여야 한다.
- fit gap을 회사/직무 관점으로 설명해야 한다.
- drafter가 바로 반영할 수 있을 정도로 조건이 명확해야 한다.
- 다른 렌즈와 섞이지 않아야 한다.

## 개발 메모

- fit reviewer는 흔히 "회사 칭찬이 적다" 수준으로 흐르기 쉽다. 이 문서는 그런 얕은 판단을 막기 위한 계약이다.
- `companyFitPack`의 품질이 낮으면 이 reviewer도 쉽게 generic해질 수 있으니, researcher 출력 품질과 함께 봐야 한다.
