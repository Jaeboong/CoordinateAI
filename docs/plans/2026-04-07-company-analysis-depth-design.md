# Company Analysis Depth Design

## Goal

ForJob의 `company-insight.md`를 현재의 `공고 기반 회사 메모` 수준에서, 자소서와 면접 준비에 직접 쓰이는 `실전형 기업 분석` 수준으로 끌어올린다.

핵심 목표는 두 가지다.

1. 회사 자체를 설명하는 근거를 더 풍부하게 수집한다.
2. 수집한 사실을 지원자 관점의 전략적 해석으로 재구성한다.

## Current State

현재 기업 분석은 아래 소스만으로 생성된다.

- 채용공고 정규화 텍스트
- 에세이 문항
- OpenDART 기업개황 / 연간 재무 요약

이 조합은 다음에는 강하다.

- 재무 스냅샷
- 공고에 드러난 팀/직무 방향
- 과장 없는 보수적 해석

하지만 다음에는 약하다.

- 회사 전체 사업 구조
- 핵심 브랜드/서비스/사업 축
- 최근 1~2년 방향 변화
- 공식 메시지 기반의 포지셔닝
- 지원자가 자소서에서 잡아야 할 “회사 이야기”

결과적으로 현재 `company-insight.md`는 회사 자체를 설명하기보다, “이 공고에서 읽히는 회사 메모”에 가깝다.

## Recommended Approach

권장 방향은 `공식 소스 우선 + 선택적 외부 보강`과 `실전형 해석 구조`의 결합이다.

### Option A: DART-only deepening

- OpenDART에서 더 많은 사업보고서 섹션을 읽는다.
- 장점: 근거가 단단하다.
- 단점: 문서가 딱딱해지고, 자소서 전략으로 연결되는 힘이 약할 수 있다.

### Option B: Official-source bundle plus strategy-first synthesis

- OpenDART + 공식 홈페이지 + 공식 채용/IR/보도자료를 우선 수집한다.
- 필요 시 외부 기사/산업 해설을 보조층으로 추가한다.
- 생성 문서는 “회사 facts”보다 “지원자가 어떻게 읽어야 하는가” 중심으로 구성한다.
- 장점: 정확성과 실전성을 같이 올릴 수 있다.
- 단점: 수집 파이프라인이 조금 더 복잡해진다.

### Option C: Prompt-only restructuring

- 소스는 유지하고 프롬프트/출력 구조만 바꾼다.
- 장점: 빠르다.
- 단점: 소스 빈약 문제를 해결하지 못한다.

### Recommendation

`Option B`를 추천한다.

이유:

- TIO 대비 약점은 “해석 방식”만이 아니라 “소스 폭”에도 있다.
- 그렇다고 외부 웹 리서치를 필수화하면 신뢰도와 안정성이 떨어진다.
- 공식 소스를 우선층으로 두고, 출력 구조를 자소서 전략형으로 바꾸는 방식이 가장 실용적이다.

## Source Model

기업 분석용 소스를 `company source bundle`로 분리한다.

### Tier 1: Required / preferred official sources

- OpenDART 기업개황 / 재무
- 회사 공식 홈페이지의 회사소개 / 사업소개
- 공식 채용 페이지
- 공식 IR / 보도자료 / 기술블로그가 있으면 포함

### Tier 2: Optional external context

- 주요 언론 기사
- 산업/증권 해설
- 경쟁사 비교 자료

### Tier 3: Excluded by default

- 커뮤니티, 잡플랫폼 후기, 비공식 블로그

정책:

- Tier 1만으로도 `company-insight.md`는 생성 가능해야 한다.
- Tier 2 실패는 전체 인사이트 생성 실패로 이어지면 안 된다.
- 근거가 약한 섹션은 생략하거나 `insufficient source coverage`를 표기한다.

## Architecture

현재 `generateInsightArtifacts()`는 4개 문서를 한 번의 프롬프트로 생성한다.

기업 분석 품질을 높이려면 `company-insight.md`를 위한 별도 pre-pass가 필요하다.

### Proposed flow

1. `job posting extraction`
2. `OpenDART enrichment`
3. `official company source collection`
4. `optional external company context`
5. `company profile synthesis`
6. `company-insight.md` generation
7. `job-insight.md`, `application-strategy.md`, `question-analysis.md` generation

핵심 변화:

- 회사 분석용 수집과 직무/문항 분석용 수집을 분리한다.
- `company-insight.md`는 회사 소스 번들을 기반으로 별도 생성한다.
- 나머지 문서는 완성된 기업 분석 결과를 추가 컨텍스트로 재사용할 수 있다.

## Data Artifacts

프로젝트별 저장 파일을 아래처럼 확장한다.

### Machine-readable

- `insights/company-enrichment.json`
- `insights/company-source-manifest.json`
- `insights/company-source-snippets.json`
- `insights/company-profile.json`

### User-facing

- `context/normalized/company-insight-*.md`

### Suggested shapes

`company-source-manifest.json`
- collectedAt
- source entries
- source tier
- source kind
- url
- title
- fetch status
- extraction notes

`company-source-snippets.json`
- source id
- snippet text
- section label
- confidence

`company-profile.json`
- one-line summary
- business model bullets
- growth drivers
- risk notes
- role relevance notes
- source coverage summary

## Company Insight Output Shape

`company-insight.md`를 아래 섹션 구조로 재정의한다.

1. `회사 한줄 정의`
2. `이 회사는 어떻게 돈을 버는가`
3. `핵심 사업 구조와 브랜드/서비스`
4. `최근 1~2년 성장축과 변화`
5. `재무 해석: 지원자가 봐야 할 포인트`
6. `공식 자료 기반 최근 방향성`
7. `이 직무가 회사 안에서 맡는 의미`
8. `자소서에서 강조할 회사 맥락 3개`
9. `면접에서 준비할 회사 질문`
10. `출처와 근거 강도`

원칙:

- 단순 기업 소개문으로 끝나지 않는다.
- 모든 섹션은 “지원자가 이 회사를 어떻게 읽어야 하는가”로 연결된다.
- 경쟁사, 최근 이슈, SWOT 같은 항목은 충분한 소스가 있을 때만 넣는다.

## UX Changes

인사이트 워크스페이스의 `기업 분석` 탭에 아래 메타를 추가한다.

- 수집 소스 범위
  - 예: `OpenDART + 공식 홈페이지 + 공식 채용`
- 수집 시각
- 외부 보강 여부
- coverage note
  - 예: `최근 이슈/경쟁사 정보는 현재 소스 범위 밖이라 생략됨`

이 메타는 “왜 이번 결과가 여기까지인지”를 사용자가 이해하게 해 준다.

## Error Handling

- 공식 홈페이지 수집 실패: DART + 공고 기반으로 계속 진행
- 외부 기사 수집 실패: 무시하고 계속 진행
- 회사 공식 페이지가 동적 로딩이면 raw HTML 전체 저장 대신 추출된 snippet만 저장
- 중복/노이즈가 많은 소스는 snippet 단위로만 저장
- source coverage가 약한 섹션은 생략 또는 `insufficient source coverage`

## Testing Strategy

필수 deterministic 테스트:

- 공식 회사 페이지 HTML에서 회사소개/사업 텍스트 추출
- source manifest / snippet 저장
- company profile synthesis orchestration
- `company-insight.md` 전용 prompt parser / output validation
- source coverage가 부족할 때 해당 섹션이 생략되거나 부족 표기가 유지되는지
- 기존 인사이트 4문서 자동 pin/context 포함 회귀

가능하면 추가:

- 에코마케팅 같은 실제 구조를 닮은 sanitized fixture
- 공식 홈페이지/IR snippet fixture

## Phased Rollout

### Phase 1

- `company source bundle` 추가
- OpenDART + 공식 홈페이지 + 공식 채용만 사용
- `company-insight.md` 전용 프롬프트 분리

### Phase 2

- 인사이트 워크스페이스에 source coverage 메타 표시
- `job/application/question` 문서가 개선된 company profile을 재사용

### Phase 3

- 선택적 외부 기사/산업 해설 보강
- 최근 이슈 / 경쟁사 / 포지셔닝 확장

## Non-goals

- 모든 회사에 대한 완전 자동 경쟁사 분석
- 기사 기반의 공격적인 투자 리포트 수준 분석
- 출처 불명 외부 콘텐츠를 사실처럼 합성하는 것
- 화려한 차트 중심 BI 대시보드

## Success Criteria

- `company-insight.md`가 회사 전체를 설명하는 문서로 읽힌다.
- 현재처럼 공고 중심 사업 축으로 좁아지지 않는다.
- 지원자가 자소서와 면접에서 바로 사용할 회사 맥락 3개 이상을 얻는다.
- source coverage 부족이 문서 안에서 명확히 드러난다.
- 외부 보강 실패가 전체 인사이트 생성 실패로 이어지지 않는다.
