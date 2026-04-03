# Voice Reviewer

`voice_reviewer.json`의 한국어 설명 문서다. 이 에이전트는 글이 사람답고 지원자 본인의 목소리를 유지하는지 점검한다.

## 역할 요약

- AI가 쓴 듯한 템플릿 문장을 잡아낸다.
- 추상적이고 복붙 가능한 표현을 구체화하도록 유도한다.
- 문장이 지나치게 매끈하지만 실제 사람의 경험처럼 들리지 않는 문제를 찾는다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 버전
- `name`: 내부 이름
- `displayName`: 표시용 이름
- `kind`: subagent
- `role: "review"`: 리뷰 역할
- `description`: 한 줄 설명
- `mission`: voice 품질을 지키는 임무 설명

### execution

- `visibility: "internal"`: 내부 reviewer
- `interactionMode: "orchestrated"`: 초안과 voice constraint를 받아서 판단
- `parallelSafe: true`: 다른 reviewer와 병렬 가능
- `writesFinalProse: false`: 직접 최종 문장을 생산하지 않음

### tools

- `allowed`: 없음
- `forbidden`: raw source 접근 금지

### inputs

- `required`
  - `essay_question`
  - `section_draft`
  - `voice_constraints`
- `optional`
  - `user_samples`
  - `review_history`
  - `word_limit`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Judgment`
  - `Reason`
  - `Condition To Close`
- `mustInclude`
  - `voice_risk`
  - `ai_smell_signals`
  - `rewrite_direction`

### constraints

- `forbiddenActions`
  - 따뜻하게 들리게 하려고 사실 정밀도를 해치지 말 것
  - 믿기 어려운 문장이 아닌 한 evidence 수준 수정 요구를 남발하지 말 것
  - company fit 문제로 확장하지 말 것
  - generic한 corporate phrasing으로 지원자 목소리를 덮지 말 것
- `requiredBehaviors`
  - empty abstraction, template phrase, copy-paste smell을 찾아낼 것
  - 취향 비평보다 구체적 rewrite direction을 줄 것
  - 1인칭 주체성과 lived detail을 살릴 것
  - 단순히 어색한 톤과 진정성 부족을 구분할 것

### success

- 판단 결과가 명시적이어야 한다.
- 왜 글이 generic하거나 artificial하게 들리는지 설명해야 한다.
- drafter가 바로 적용할 정도의 rewrite 방향이 있어야 한다.
- 다른 reviewer 역할과 섞이지 않아야 한다.

## 개발 메모

- voice reviewer는 주관성이 가장 큰 역할이라, 시스템적으로는 `bad phrase examples`나 `forbidden pattern` 룰 파일과 함께 쓰는 편이 안정적이다.
- `userSamples`가 있으면 훨씬 강해질 수 있으므로 이후 입력 스키마에서 중요도를 높일 가치가 있다.
