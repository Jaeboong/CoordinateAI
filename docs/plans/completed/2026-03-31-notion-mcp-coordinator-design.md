# Notion MCP Coordinator-Only Design

## Goal

`ForJob` 실행 중에 사용자가 자연어로 노션 자료를 요청하면, 선택된 `coordinator` provider만 자신의 Notion MCP를 사용해 관련 페이지나 데이터베이스를 찾고 요약하도록 만든다. reviewer들은 노션 MCP를 직접 사용하지 않고 coordinator가 만든 `Notion Brief`만 받아 피드백 토론에 참여한다.

## Why This Design

- 현재 `ForJob`는 `.forjob`에 저장된 파일 컨텍스트를 조합해 provider에 프롬프트를 보내는 구조다.
- 노션을 `ForJob`가 직접 동기화하는 방식은 재현성은 좋지만 구현량이 크고, 사용자가 원한 `"CJ 올리브네트웍스 페이지 가져와서 파악해"` 같은 자연어 흐름과는 거리가 있다.
- 각 provider에 모두 노션 MCP를 열어두면 provider별로 서로 다른 페이지를 읽을 수 있어 토론 기준이 어긋날 수 있다.
- 따라서 `coordinator only`가 자연어 사용성과 토론 일관성 사이의 균형점이다.

## Product Shape

### Runs 탭

- 기존 `Essay question`
- 기존 `Current draft`
- 신규 `Notion request` 입력칸
- 예시 placeholder:
  - `CJ 올리브네트웍스 페이지 가져와서 파악해`
  - `신한은행 관련 노션 자료 찾아서 핵심만 반영해`

값이 비어 있으면 기존 실행 흐름과 완전히 동일하게 동작한다.

### 실행 흐름

1. 사용자가 `Runs` 탭에 `Notion request`를 입력한다.
2. `ReviewOrchestrator`가 정규 리뷰 라운드 전에 coordinator pre-pass를 1회 실행한다.
3. coordinator는 자신의 Notion MCP로 search/fetch/query를 수행해 `Notion Brief`를 작성한다.
4. reviewer prompt에는 원래 compiled context에 `Notion Brief`를 덧붙여 전달한다.
5. reviewer들은 노션 MCP를 직접 보지 않고 `Notion Brief` 기준으로 피드백한다.
6. final coordinator prompt에도 같은 `Notion Brief`와 reviewer discussion을 함께 넣는다.

## Confidence Rule

`ForJob`가 직접 search 결과 점수를 계산하지는 않는다. 대신 coordinator prompt에 다음 정책을 명시한다.

- 가장 관련 높은 결과가 하나로 충분히 확실하면 바로 사용한다.
- 1등과 2등 결과가 애매하면 임의 확정하지 말고, 가장 가능성 높은 후보 2~3개와 이유를 짧게 설명한 뒤 보수적으로 `Notion Brief`를 작성한다.
- 확인 불가하면 `"Notion request could not be resolved confidently"`를 brief에 명시한다.

즉 점수 계산은 CLI+MCP를 사용하는 coordinator 모델에게 위임하고, `ForJob`는 그 결과를 downstream context로 재사용한다.

## Prompt Contract

### Coordinator pre-pass output

coordinator pre-pass는 반드시 아래 섹션을 포함한 Markdown을 반환한다.

- `## Resolution`
- `## Notion Brief`
- `## Sources Considered`

`Resolution`에는 확정/애매/실패 여부를 적고, `Notion Brief`에는 실제로 reviewer가 읽어야 할 핵심만 남긴다.

### Reviewer prompt

reviewer prompt에는:

- compiled context
- optional `Notion Brief`
- prior discussion

만 넣는다. reviewer에게는 노션 MCP를 직접 탐색하라고 지시하지 않는다.

### Final coordinator prompt

final coordinator prompt에는:

- compiled context
- optional `Notion Brief`
- reviewer discussion

을 함께 넣어 최종 요약과 수정 초안을 생성하게 한다.

## Data Model Changes

`RunRequest` / `RunRecord`에 다음 필드를 추가한다.

- `notionRequest?: string`
- `notionBrief?: string`

`notionBrief`는 실행 중 생성되며 run artifact와 record에 남긴다.

추가 artifact:

- `notion-brief.md`

## File/Module Changes

### `src/core/types.ts`

- `RunRequest`
- `RunRecord`
- 필요하면 `RunArtifacts`는 그대로 유지

### `src/core/schemas.ts`

- `RunRecordSchema`에 optional notion fields 반영

### `src/core/orchestrator.ts`

- coordinator pre-pass 단계 추가
- reviewer/coordinator prompt builder가 optional `notionBrief`를 받도록 확장
- `notion-brief.md` 저장

### `src/webview/sidebar.ts`

- `Runs` 탭에 `Notion request` textarea 추가
- `runReview` postMessage payload에 `notionRequest` 포함
- run preview에서 brief artifact 열기 버튼을 보여줄지 결정

### `src/core/viewModels.ts`

- 필요하면 run artifact preview에 `notionBrief` 존재 여부 추가

### `src/extension.ts`

- `runReview` payload에서 `notionRequest`를 받아 `RunRequest`에 전달
- artifact 열기 목록에 `notion-brief.md` 추가

### Tests

- `src/test/orchestrator.test.ts`
  - notion request가 있을 때 coordinator pre-pass가 먼저 실행되는지
  - generated `notion-brief.md`가 reviewer prompt에 포함되는지
  - notion pre-pass 실패 시 run이 어떻게 종료되는지 또는 brief에 실패 내용이 남는지

## Error Handling

- coordinator pre-pass가 실패하면 기본 정책은 `run failed`
  이유: 사용자가 명시적으로 노션 자료를 보라고 요청했기 때문이다.
- 단, 노션 요청이 비어 있으면 기존과 동일하게 실행한다.
- brief는 생성됐지만 resolution이 애매한 경우에는 run을 계속하되, `Resolution` 섹션에 애매함을 남긴다.

## Testing Strategy

- unit tests로 prompt assembly와 artifact persistence를 검증한다.
- fake gateway를 사용해 coordinator pre-pass / reviewer rounds / final synthesis를 분리해서 검증한다.
- UI는 현재 테스트 인프라가 얇으므로, 메시지 payload 변화는 extension/orchestrator 테스트 중심으로 검증한다.

## Trade-offs

### Pros

- 자연어 기반 노션 참조 흐름을 바로 지원한다.
- `ForJob`가 노션 API/MCP를 직접 구현하지 않아도 된다.
- reviewer 간 문서 불일치를 줄인다.

### Cons

- coordinator provider가 실제로 Notion MCP를 쓸 수 있어야 한다.
- 노션 요약 품질이 coordinator 1개 모델에 의존한다.
- `.forjob`에 원본 노션 데이터가 아니라 요약 brief만 남는다.

## Future Extensions

- provider별 MCP access 토글
- `ForJob` 직접 동기화 모드와 coordinator-MCP 모드 공존
- `Notion Brief` 승인 후 리뷰 실행하는 2단계 UX
