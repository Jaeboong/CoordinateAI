# Prompt Token Optimization Design

## Summary

현재 ForJob의 토큰 사용량은 출력보다 입력 prompt가 압도적으로 큰 구조다. 특히 `실시간 대화형`에서 라운드가 늘어날수록 동일한 큰 컨텍스트를 코디네이터와 여러 리뷰어에게 반복해서 재주입하고, `Notion pre-pass`에서는 명시적인 사용자 요청이 거의 없을 때도 큰 Notion 페이지를 여러 개 fetch하면서 입력 토큰이 과도하게 커진다.

이번 변경의 목적은 품질을 크게 해치지 않으면서 입력 prompt를 역할별로 다르게 줄이고, Notion pre-pass와 discussion history를 더 엄격하게 예산화해 토큰 사용량을 체계적으로 낮추는 것이다.

## Evidence

최근 시스템 스트림 기준으로 병목은 명확했다.

- Notion pre-pass coordinator turn: `input_tokens = 266157`, `output_tokens = 2830`
- Round 1 realtime coordinator turn: `input_tokens = 63198`, `output_tokens = 646`
- Round 1 Codex reviewer turns: `input_tokens = 63147`, `63766`
- Round 1 Gemini reviewer turn: `input_tokens = 27347`
- Round 2 realtime coordinator turn: `input_tokens = 55958`
- Round 2 Codex reviewer turns: `input_tokens = 64366`, `64985`
- Round 2 Gemini reviewer turn: `input_tokens = 28515`

즉 현재 비용 구조는 `짧은 출력 여러 개`가 아니라 `큰 입력 prompt를 라운드마다 여러 모델에 반복`하는 데서 생긴다.

## Root Causes

### 1. Full compiled context is repeated too often

`ContextCompiler`는 회사/포지션/평가 기준/문항/현재 draft뿐 아니라, 선택된 프로필 문서와 프로젝트 문서의 normalized content를 그대로 붙인다. 이 큰 컨텍스트를 `buildCompiledContextMarkdown()`이 라운드마다 다시 만들고, 코디네이터와 각 리뷰어에게 반복해서 전달한다.

### 2. Role-specific prompt needs are not separated enough

실시간 reviewer는 사실상 `Mini Draft`, `Current Focus`, `Open Challenges`, 일부 직전 맥락만 있어도 충분한데, 현재는 여전히 큰 compiled context와 discussion history를 함께 받는다.

### 3. Notion pre-pass is too broad when request quality is poor

`notionRequest`가 실질적으로 비어 있거나 `.` 같은 punctuation-only 값이어도 pre-pass가 진행될 수 있다. 이 경우 모델은 검색 후보를 넓게 보고, 현재 draft 복제본이 들어 있는 큰 페이지와 보강용 페이지를 둘 다 fetch해 context를 과도하게 키운다.

### 4. Discussion history is still expensive

realtime 모드는 `Recent Discussion`과 `Previous Round Reviewer Summary`를 함께 붙인다. 최근 ledger 설계로 반복은 줄었지만, 아직 원문 discussion history 비중이 크다.

### 5. We lack explicit prompt-budget telemetry

지금은 provider stdout에 usage가 보이는 경우만 체감할 수 있고, ForJob 자체가 `turn별 prompt 길이`, `context 길이`, `history 길이`, `notion brief 길이`를 구조적으로 기록하지 않는다. 그래서 최적화 후 효과를 비교하기 어렵다.

## Goals

- common realtime run에서 reviewer prompt input을 현재 대비 `50% 이상` 줄인다.
- simple Notion pre-pass에서 `266k`처럼 비정상적으로 큰 입력이 나오지 않게 하고, 불필요한 pre-pass는 아예 건너뛴다.
- 역할별로 필요한 정보만 주는 `prompt budget` 구조를 만든다.
- 최적화 후에도 reviewer 판단 품질과 final draft 수렴 흐름은 유지한다.
- 다음 튜닝을 위해 turn-level prompt metrics를 남긴다.

## Non-goals

- provider CLI의 자체 세션 복원 기능에 의존하지 않는다.
- deep feedback와 realtime을 하나의 prompt 포맷으로 통합하지 않는다.
- 문서 요약을 LLM으로 오프라인 precompute하는 큰 파이프라인까지 이번 변경에 포함하지 않는다.
- Notion connector 사용 방식을 완전히 재설계하지 않는다.

## Options Considered

### Option A: Role-based prompt compaction

- `full / compact / minimal` 같은 context profile을 도입한다.
- reviewer와 coordinator, Notion pre-pass에 서로 다른 context budget을 준다.
- discussion history와 session snapshot을 더 짧은 요약 블록으로 대체한다.

장점:
- 현재 구조를 크게 뒤엎지 않고 바로 효과가 난다.
- provider 차이에 덜 민감하다.
- 테스트 가능성이 높다.

단점:
- 요약 전략이 부족하면 품질이 일부 흔들릴 수 있다.

### Option B: Precomputed document digests

- profile/project documents를 import 시 또는 저장 시 짧은 digest로 같이 보관한다.
- prompt에는 raw normalized content 대신 digest만 넣는다.

장점:
- 가장 큰 반복 입력을 구조적으로 줄일 수 있다.
- long document가 많아질수록 효과가 크다.

단점:
- 저장 구조 변화가 커지고, digest 품질 관리가 필요하다.
- 이번 세션 범위를 조금 넘길 수 있다.

### Option C: Provider session reuse

- Codex/Claude/Gemini의 `resume/continue` 기능을 직접 활용한다.

장점:
- prompt에 덜 싣고도 문맥 유지 가능성이 있다.

단점:
- provider별 API/CLI 차이가 크다.
- 중복 reviewer slot 분리와 디버깅이 어려워진다.
- 재현성과 테스트가 나빠진다.

## Chosen Approach

`Option A`를 중심으로, 일부 `Option B`를 흉내 내는 `lightweight digest` 전략을 섞는 하이브리드 방식을 택한다.

핵심은 다음 5가지다.

1. `notionRequest`를 정규화해서 punctuation-only 값은 빈 값으로 본다.
2. `Notion pre-pass`는 `minimal context`만 받고, request가 실질적으로 비어 있으면 건너뛴다.
3. `ContextCompiler`에 profile을 도입해 `full / compact / minimal` 컨텍스트를 만든다.
4. `realtime reviewer`는 전체 draft와 전체 문서 대신 `mini draft + target section + compact digests + unresolved challenges` 중심으로 받는다.
5. turn-level `prompt metrics`를 artifact와 이벤트로 남긴다.

## Proposed Prompt Budget Profiles

### Full

사용처:
- deep feedback reviewer/coordinator
- realtime final draft

포함:
- project basics
- rubric
- question
- full current draft
- selected document full normalized content
- notion brief full text

### Compact

사용처:
- realtime coordinator discussion/redirect

포함:
- project basics
- question
- current draft
- short rubric summary
- selected documents as short excerpts/digests
- compact notion brief
- latest ledger
- previous round summary

제외/축소:
- full normalized content 전문
- long previous discussion 원문 다수

### Minimal

사용처:
- realtime reviewer
- notion pre-pass

포함:
- company/role basics
- target section
- mini draft
- accepted decisions
- open challenges
- question
- short current draft excerpt or relevant paragraph only
- compact notion brief or explicit request only

제외:
- full project/profile context
- long discussion history
- full session snapshot

## Notion Pre-pass Budget Rules

- punctuation-only `notionRequest`는 빈 값으로 취급한다.
- explicit request가 없고 project에 고정 notion page ids도 없으면 pre-pass를 건너뛴다.
- pre-pass prompt는 `question + draft excerpt + explicit request`만 사용한다.
- prompt에서 search/fetch 예산을 명시한다.
  - search top 3 이하
  - fetch max 2 pages
  - 이미 current draft 복제본처럼 보이는 페이지는 보강 가치가 있을 때만 fetch
- Notion brief는 다음 턴으로 넘길 때 compact summary로 다시 압축한다.

## History Compression Rules

- realtime reviewer는 `Recent Discussion` 원문 대신 `Previous Round Reviewer Summary` + `Discussion Ledger`를 우선 사용한다.
- 필요하다면 `Recent Discussion`은 최근 2~3개 turn만 유지한다.
- deep feedback의 `Current Session Snapshot`도 이후 단계에서 축약 가능하지만, 이번 변경 1차 목표는 realtime과 Notion pre-pass다.

## Metrics and Verification

ForJob 자체가 아래를 turn 단위로 남기도록 한다.

- `promptChars`
- `estimatedPromptTokens`
- `contextChars`
- `historyChars`
- `notionBriefChars`
- `discussionLedgerChars`

이 정보는 `prompt-metrics.json` artifact 또는 `prompt-budget` 계열 run event로 저장한다.

## Expected Impact

- punctuation-only notion request 케이스에서 가장 큰 과금 폭탄을 제거한다.
- realtime reviewer prompt가 `full context repeat`에서 `targeted critique`로 바뀌며, 3 reviewer 구조일수록 절감 효과가 커진다.
- discussion ledger가 이미 있는 현재 구조와 잘 맞아서, 품질 하락 없이 history raw text를 줄일 수 있다.

## Risks

- reviewer가 전체 draft를 덜 보면서 문맥 상실이 생길 수 있다.
- compact notion brief가 과도하게 줄면 중요한 정정 포인트를 놓칠 수 있다.
- deep feedback까지 한 번에 줄이려 하면 품질 회귀를 파악하기 어려워진다.

## Mitigations

- 1차에서는 realtime + notion pre-pass를 우선 최적화한다.
- `full / compact / minimal` profile을 테스트에서 명시적으로 검증한다.
- prompt metrics를 남겨 실제 절감 효과와 품질 회귀를 함께 본다.

## Testing

- punctuation-only notion request가 pre-pass를 건너뛰거나 최소 컨텍스트만 쓰는지 테스트한다.
- realtime reviewer prompt에 full document content가 더 이상 들어가지 않는지 테스트한다.
- compact/minimal context가 target section, mini draft, ledger는 유지하는지 테스트한다.
- prompt metrics artifact/event가 저장되는지 테스트한다.
