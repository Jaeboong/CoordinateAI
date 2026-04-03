# Finalizer

`finalizer.json`의 한국어 설명 문서다. 이 에이전트는 승인된 수정만 반영해 최종 section 또는 최종 답안을 정리한다.

## 역할 요약

- draft와 reviewer 결론을 합쳐 최종 문단을 만든다.
- 중복, 충돌, 흐름 어색함을 정리한다.
- 길이 제한과 must-keep 포인트를 동시에 맞춘다.

## JSON 필드 설명

### 기본 메타데이터

- `schemaVersion`: 설정 버전
- `name`: 내부 식별자
- `displayName`: 표시용 이름
- `kind`: subagent
- `role: "integration"`: 여러 산출물을 합쳐 최종 텍스트를 만드는 역할
- `description`: 한 줄 설명
- `mission`: 새 근거 없이 승인된 결과만 통합하라는 지시

### execution

- `visibility: "internal"`: 내부 파이프라인용
- `interactionMode: "orchestrated"`: upstream 결정이 모인 뒤 실행
- `parallelSafe: false`: 같은 final output을 동시에 여러 개 만들 필요가 적다.
- `writesFinalProse: true`: 최종 prose 작성 책임이 있다.

### tools

- `allowed`: 없음
- `forbidden`: raw source 접근과 사용자 직접 대화 모두 금지

### inputs

- `required`
  - `essay_question`
  - `approved_section_draft`
  - `reviewer_decisions`
  - `must_keep`
- `optional`
  - `word_limit`
  - `neighbor_sections`
  - `user_guidance`
  - `format_constraints`

### outputs

- `format: "structured_markdown"`
- `sections`
  - `Final Draft`
  - `Final Checks`
- `mustInclude`
  - `word_limit_status`
  - `evidence_boundary_check`
  - `open_residual_risks`

### constraints

- `forbiddenActions`
  - 새 근거나 새 업적 추가 금지
  - reviewer `BLOCK`을 upstream 합의 없이 무시 금지
  - 닫힌 research 질문을 다시 열지 말 것
  - 흐름을 이유로 must-keep 포인트를 조용히 삭제하지 말 것
- `requiredBehaviors`
  - 중복과 모순 제거
  - 승인된 evidence boundary와 voice direction 존중
  - 짧고 자연스러운 전환 사용
  - 남는 tradeoff는 `Final Checks`에 노출

### success

- 최종 텍스트가 사용자 검토 가능한 수준이어야 한다.
- unsupported claim이 새로 생기면 안 된다.
- 길이 제한을 맞추고 must-keep 포인트를 지켜야 한다.
- residual risk가 있으면 `Final Checks`에 남아야 한다.

## 개발 메모

- finalizer는 "마지막 writer"처럼 보이지만 실제로는 자유도가 매우 낮은 integrator다.
- 운영 시 가장 흔한 실수는 흐름을 좋게 만든다는 이유로 근거 강한 문장을 삭제하는 것이다. 그래서 `mustKeep`을 required input으로 뒀다.
