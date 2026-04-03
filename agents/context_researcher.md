# Context Researcher

`context_researcher.json`의 한국어 설명 문서다. 이 에이전트는 자소서 작성 파이프라인에서 실제 문장을 쓰기 전에 근거를 수집하고 정규화하는 역할을 맡는다.

## 역할 요약

- 저장소 활동, 프로젝트 문서, 회사 정보, 사용자 메모를 모아서 자소서에 바로 쓸 수 있는 근거 묶음으로 정리한다.
- downstream agent가 raw source를 다시 뒤지지 않도록 `evidence pack` 형태로 가공한다.
- 개인 기여, 팀 기여, 출처 불명 내용을 구분해 attribution을 명시한다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 이 설정 파일의 버전이다. 나중에 스키마가 바뀌면 마이그레이션 기준으로 쓴다.
- `name`: 시스템 내부에서 이 에이전트를 식별하는 고유 이름이다.
- `displayName`: UI나 로그에서 사람이 읽기 좋은 이름이다.
- `kind`: 현재는 위임형 내부 에이전트이므로 `subagent`로 둔다.
- `role`: 파이프라인 상의 책임 유형이다. 이 에이전트는 `research`다.
- `description`: 짧은 한 줄 설명이다.
- `mission`: 더 긴 수준의 임무 설명이다. 프롬프트 조립 시 핵심 역할 문장으로 쓸 수 있다.

### execution

- `visibility: "internal"`: 사용자와 직접 대화하는 용도가 아니라 내부 처리용이라는 뜻이다.
- `interactionMode: "independent"`: 다른 agent와 대화하지 않고 입력만 받아 독립적으로 결과를 낸다.
- `parallelSafe: true`: source별 병렬 조사 구조에 넣어도 안전하다는 뜻이다.
- `writesFinalProse: false`: 최종 자소서 문장을 쓰는 역할이 아니라는 뜻이다.

### tools

- `allowed`: 접근 가능한 source와 도구 목록이다.
  - `github_mcp`
  - `notion_mcp`
  - `dart_mcp`
  - `local_git`
  - `repository_metadata`
- `forbidden`: 절대 하면 안 되는 상호작용 목록이다.
  - 사용자 직접 대화 금지
  - 다른 agent와 직접 대화 금지

### inputs

- `required`: 실행에 반드시 필요한 입력이다.
  - `essay_question`: 현재 자소서 문항
  - `selected_documents`: 사용자가 고른 문서
  - `current_draft`: 현재 초안
  - `user_guidance`: 사용자 메모나 방향성
- `optional`: 있으면 품질이 좋아지는 보조 입력이다.
  - `target_company`
  - `target_role`
  - `project_scope_hint`
  - `word_limit`

### outputs

- `format: "structured_markdown"`: 결과는 구조화된 Markdown 블록으로 반환한다는 뜻이다.
- `sections`: 반드시 포함해야 하는 결과 섹션 이름이다.
  - `Project Evidence Pack`
  - `Company Fit Pack`
  - `Source Notes`
- `mustInclude`: 하위 결과물에서 누락되면 안 되는 핵심 항목이다.
  - 재사용 가능한 주장
  - source locator
  - attribution
  - confidence
  - 남아 있는 불확실성

### constraints

- `forbiddenActions`: 금지 행동이다.
  - 근거 없는 개인 기여 주장 금지
  - 다른 agent에게 source 확인 요청 금지
  - polished essay 문장 작성 금지
  - raw MCP 응답 그대로 전달 금지
- `requiredBehaviors`: 반드시 지켜야 하는 행동 원칙이다.
  - 프로젝트 사실과 개인 기여를 분리
  - attribution이 약하면 confidence를 낮춤
  - 과장보다 안전한 약한 표현 선호
  - downstream이 바로 쓸 수 있는 normalized evidence unit 반환

### success

- `criteria`: 성공 판정 기준이다.
  - 핵심 주장마다 provenance와 confidence가 붙어야 한다.
  - self / team / unknown 구분이 명확해야 한다.
  - drafting에 바로 쓸 수 있는 company fit 정보가 있어야 한다.
  - 약한 근거는 숨기지 말고 표시해야 한다.

## 개발 메모

- 이 에이전트는 자소서 품질의 바닥선을 정하는 역할이다. 여기서 attribution이 흐리면 뒤 단계가 모두 흔들린다.
- 런타임에서 병렬 researcher 구조를 도입할 경우, `context_researcher`를 상위 추상 역할로 두고 source별 researcher로 세분화할 수 있다.
- 출력 포맷은 구조화 Markdown이지만, 내부적으로는 JSON으로 재구성해도 무방하다. 중요한 것은 downstream에서 동일한 의미 구조를 읽을 수 있어야 한다는 점이다.
