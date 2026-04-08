# Role-Based Runs UI Design

## Goal

현재 `Runs` 탭의 참여자 UI는 `Coordinator 1 + Reviewer N` 구조를 전제로 한다.

새 역할 아키텍처에서는 실제 실행 단위가 아래처럼 바뀐다.

- `context_researcher`
- `section_coordinator`
- `section_drafter`
- `fit_reviewer`
- `evidence_reviewer`
- `voice_reviewer`
- `finalizer`

따라서 `Runs` 탭 UI도 "참여자 선택"이 아니라 "역할 배치"를 중심으로 다시 설계해야 한다.

이 문서는 역할 아키텍처를 사용자에게 어떻게 노출할지, 그리고 provider/model 선택을 어떤 계층으로 나눌지 정리한다.

## 왜 별도 문서로 분리하는가

`2026-04-03-agent-role-architecture-design.md`는 agent 책임 분리와 계약 설계가 중심이다.

하지만 UI 설계는 아래를 따로 다뤄야 한다.

- 어떤 역할을 기본 화면에 노출할지
- 어떤 역할은 내부 구현으로 숨길지
- provider 선택과 model 선택을 어디서 할지
- 기존 `coordinator + reviewers` 저장 포맷에서 어떻게 넘어갈지

즉 역할 구조와 UI는 연결되어 있지만 변경 주기가 다르므로 별도 문서가 적합하다.

## Current State

현재 `Runs` 탭은 대략 아래 경험을 제공한다.

- `코디네이터` provider 1개 선택
- `리뷰어` provider 여러 개 선택
- reviewer는 같은 provider를 중복 선택 가능
- provider별 model / effort는 `Providers` 탭에서 전역 설정

즉 현재 UI는 "누가 coordinator이고 누가 reviewer인가"만 표현할 수 있고, 역할이 더 세분화된 구조는 담기 어렵다.

## Recommended Direction

### 핵심 원칙

- `Runs` 탭은 "이번 실행에서 각 역할에 어떤 provider를 배치할지"를 다룬다
- `Providers` 탭은 "각 provider의 기본 model / effort"를 다룬다
- 역할별 model 선택은 기본 화면이 아니라 `고급 옵션`에서만 연다
- UI에는 내부 implementation role이 아니라 top-level role만 노출한다

### 기본 화면에서 노출할 역할

기본적으로 아래 7개만 노출한다.

- `context_researcher`
- `section_coordinator`
- `section_drafter`
- `fit_reviewer`
- `evidence_reviewer`
- `voice_reviewer`
- `finalizer`

### 기본 화면에서 숨길 역할

아래는 내부 분해용 역할이므로 v1 UI에서는 숨긴다.

- `prompt_normalizer`
- `github_researcher`
- `notion_researcher`
- `dart_researcher`
- `research_synthesizer`

즉 사용자는 "조사 담당", "작성 담당", "검토 담당"까지만 배치하고, 세부 내부 분해는 런타임이 처리한다.

## UX Structure

### 1. 섹션 이름 변경

현재 `참여자` 섹션은 의미가 좁다.

권장 이름:

- `역할 배치`
- 또는 `Workflow`

이 섹션은 "사람 수"가 아니라 "각 역할을 어느 provider가 맡는가"를 다루기 때문이다.

### 2. 기본 레이아웃

기본 화면은 역할별 provider 선택만 보여 준다.

예시:

- `Research`
  - `Context Researcher` -> provider select
- `Drafting`
  - `Section Coordinator` -> provider select
  - `Section Drafter` -> provider select
  - `Finalizer` -> provider select
- `Review`
  - `Fit Reviewer` -> provider select
  - `Evidence Reviewer` -> provider select
  - `Voice Reviewer` -> provider select

각 row에는 아래 정보만 기본 노출한다.

- 역할 이름
- provider select
- 현재 적용 중인 기본 model / effort 요약

예시 표시:

- `Codex · gpt-5.4 · medium`
- `Claude · sonnet · high`
- `Gemini · gemini-2.5-pro`

즉 model은 보이되, 기본 화면에서 직접 변경하지는 않는다.

### 3. 고급 옵션

각 역할 row 또는 전체 섹션 상단에 `고급 옵션` 버튼을 둔다.

이 버튼을 열면 각 역할에 대해 아래 override를 허용한다.

- `Model override`
- `Effort override`
- `Use provider default` 토글

기본값은 항상 `Use provider default = true`다.

즉 일반 사용자는 provider만 고르면 되고, 세밀한 튜닝이 필요한 경우에만 override를 건드린다.

### 4. Preset

기본 실행을 단순하게 만들기 위해 `Preset` 개념을 두는 것이 좋다.

권장 preset:

- `Recommended`
- `Single-provider`
- `Custom`

`Recommended` 예시:

- `context_researcher` -> Codex
- `section_coordinator` -> Codex
- `section_drafter` -> Claude
- `fit_reviewer` -> Gemini
- `evidence_reviewer` -> Codex
- `voice_reviewer` -> Claude
- `finalizer` -> Claude

`Single-provider`는 모든 역할을 하나의 provider로 맞춘다.

`Custom`은 사용자가 각 역할을 직접 바꾼 상태다.

즉 기본 진입은 preset 기반으로 빠르게 시작하고, 필요하면 각 역할을 수정하는 구조가 좋다.

## Why Not Put Model Selectors In The Default UI

기본 화면에서 역할별 provider와 model을 동시에 다 열면 아래 문제가 생긴다.

- 역할 수가 7개로 늘어나 화면 밀도가 높아진다
- `Providers` 탭과 `Runs` 탭의 책임이 겹친다
- 대부분의 사용자는 provider만 바꾸고 model은 자주 안 바꾸므로 노이즈가 커진다
- provider default와 role override의 관계가 헷갈리기 쉽다

따라서 기본 UI는 역할별 provider 선택까지만 보여 주고, role-specific model selection은 `고급 옵션`으로 분리하는 것이 좋다.

## Data Model Direction

현재 저장 구조는 대략 아래에 가깝다.

- `coordinatorProvider`
- `reviewerProviders[]`

새 구조에서는 역할별 assignment가 필요하다.

권장 shape:

```json
{
  "roleAssignments": [
    {
      "role": "context_researcher",
      "providerId": "codex",
      "useProviderDefaults": true,
      "modelOverride": "",
      "effortOverride": ""
    },
    {
      "role": "section_drafter",
      "providerId": "claude",
      "useProviderDefaults": false,
      "modelOverride": "sonnet",
      "effortOverride": "high"
    }
  ]
}
```

해석 규칙:

- `useProviderDefaults = true`면 override 값은 무시
- override가 비어 있으면 해당 provider의 기본 설정 사용
- provider가 effort를 지원하지 않으면 effort field는 무시하거나 비활성 표시

## Runtime Interpretation

실행 시 런타임은 아래 순서로 설정을 결정한다.

1. 역할별 `providerId` 확인
2. 해당 provider의 기본 model / effort를 `Providers` 탭 설정에서 읽음
3. role assignment에 override가 있으면 그것으로 덮어씀
4. 최종적으로 각 역할 participant를 실행 큐에 배치

즉 source of truth는 다음처럼 나뉜다.

- provider 기본 설정: `Providers` 탭
- 역할별 배치: `Runs` 탭
- 역할별 override: `Runs > 고급 옵션`

## Migration From Current UI

v1 전환 시에는 기존 coordinator/reviewer 구조를 완전히 버리기보다, 아래처럼 단계적으로 가는 것이 안전하다.

### Phase 1

- `참여자`를 `역할 배치`로 교체
- `coordinator + reviewers` 대신 top-level role 7개 노출
- 역할별 provider select 추가
- model / effort는 여전히 `Providers` 탭 기본값 상속

### Phase 2

- `고급 옵션` 패널 도입
- 역할별 `modelOverride`, `effortOverride` 지원
- 현재 적용 중인 provider default와 override 상태를 함께 표시

### Phase 3

- preset 지원
- 내부 role decomposition이 필요하면 UI는 그대로 두고 런타임만 확장

## Validation Rules

- 모든 top-level role에는 provider가 하나씩 배정되어야 한다
- provider health check는 역할별로 적용한다
- 같은 provider를 여러 역할에 반복 배정하는 것은 허용한다
- effort 미지원 provider에는 effort override control을 비활성화한다
- `고급 옵션`을 닫아도 override 활성 여부는 요약으로 보여 준다

## UX Copy Suggestions

- 섹션 제목: `역할 배치`
- 보조 문구: `이번 실행에서 각 역할을 어느 AI가 맡을지 정하세요.`
- 고급 옵션 버튼: `고급 옵션`
- 기본값 상속 토글: `Provider 기본 설정 사용`
- override 요약:
  - `기본 설정 상속`
  - `모델 override 적용`
  - `모델/추론 강도 override 적용`

## Open Questions

- `context_researcher`와 `finalizer`를 기본 화면에서 항상 보일지, `고급 역할 보기`로 접을지
- `Recommended` preset의 실제 기본 배치를 무엇으로 둘지
- role assignment를 기존 run record와 어떻게 하위 호환할지
- reviewer 3종을 개별 row로 항상 펼칠지, `Reviewers` 그룹으로 접었다 펼칠지

## Recommended Decision

현재 기준으로 가장 안정적인 방향은 아래다.

- 기본 UI에는 top-level role 7개를 모두 보인다
- 각 역할에서는 provider만 고른다
- model / effort는 provider default를 기본으로 상속한다
- 역할별 model / effort 변경은 `고급 옵션`에서만 허용한다
- 내부 researcher 분해는 UI에 드러내지 않는다

즉 사용자는 평소에는 "누가 어떤 역할을 맡는가"만 결정하고, 파워 유저만 필요할 때 role-specific override를 건드리는 경험이 된다.
