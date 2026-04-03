# Agent Role Architecture Design

## 목적

현재 CoordinateAI의 realtime 토론은 section close / handoff 제어는 좋아졌지만, 역할 분리가 약해서 결과물이 체계적으로 축적되기보다 코디네이터 초안을 여러 리뷰어가 고치는 형태로 흐르기 쉽다.

이 문서는 지금까지 논의한 내용을 바탕으로 다음 단계의 역할 아키텍처를 정리한다.

- coordinator는 무엇만 해야 하는가
- 어떤 역할을 별도 agent로 분리할 것인가
- `agent_name.json`에 어떤 계약을 담을 것인가
- `git MCP`, `DART MCP`, `Notion MCP`는 누구에게만 열 것인가

## 현재 구현 상태 요약

현재 shipped realtime 구조는 본질적으로 `코디네이터 1 + 리뷰어 N` 구조다.

- coordinator는 ledger를 갱신하고, `Current Focus`, `Target Section`, `Mini Draft`, `Accepted Decisions`, `Open Challenges`, `Deferred Challenges`, `Section Outcome`, `Challenge Decisions`를 출력한다.
- reviewer는 blind rule 아래서 `Mini Draft`, `Challenge`, `Cross-feedback`, `Status` 형식으로 응답한다.
- reviewer는 `technical`, `interviewer`, `authenticity` 렌즈가 배정되지만, 책임 경계는 아직 얕다.
- Notion pre-pass도 현재는 coordinator가 처리한다.

즉, 현재 구조는 role-driven discussion이라기보다 state-driven discussion에 가깝다.

## 현재 구조의 문제

가장 큰 문제는 coordinator가 너무 많은 역할을 겸한다는 점이다.

- 진행자
- 쟁점 선택자
- 중간 요약자
- 부분 작성자
- section close 판정자
- handoff 결정자

이 구조에서는 coordinator가 먼저 `Mini Draft`를 쓰고, reviewer들은 결국 그 문장을 수정하는 방향으로 수렴하기 쉽다. 그러면 토론이 "쟁점을 닫는 과정"보다 "코디네이터 문장을 편집하는 과정"처럼 보이게 된다.

추가로 아래 문제가 생긴다.

- coordinator가 사실상 작성자와 판정자를 동시에 겸함
- reviewer가 자기 고유 역할보다 편집자처럼 동작함
- 근거 수집과 문장 작성과 품질 비평이 한 프롬프트 체인에 섞임
- prompt budget과 source provenance 관리가 어려워짐

## 핵심 설계 판단

### 권장안

coordinator는 `토론 운영자`로 축소한다.

즉 coordinator는 다음만 담당한다.

- 현재 섹션 선언
- 이번 라운드에 다룰 활성 쟁점 선택
- 각 agent에 줄 reference packet 정리
- 현재 섹션 close 가능 여부 판단
- 다음 섹션 handoff 결정
- final write 가능 여부 판정

반대로 coordinator에서 빼는 것을 권장한다.

- 사전 정보 취합
- 사실 확인과 근거 발굴
- 실질적인 문장 초안 작성
- 품질 비평
- 회사/직무 적합성 해석 자체

### 결론

`Mini Draft`를 coordinator가 직접 쓰는 구조는 다음 단계에서 축소하거나 제거하는 것이 좋다.

가장 권장하는 방향은:

- coordinator는 prose 초안을 쓰지 않는다
- drafter가 section draft를 쓴다
- reviewer는 역할별 비평만 한다
- finalizer가 최종 문안을 통합한다

## 권장 역할 구조

### 1. context_researcher

역할:

- 사전 정보 수집
- 사용자 프로젝트 근거 추출
- 회사/직무 공식 정보 요약
- source provenance 정리
- 외부/저장소 컨텍스트를 자소서용 evidence pack으로 정규화
- 사전정보 전처리 전용 agent로 동작

입력:

- 자소서 문항
- 현재 draft
- selected documents
- continuation note / user guidance

직접 접근 가능한 source:

- `GitHub MCP`
- `Notion MCP`
- `DART MCP`
- 필요 시 local git history / repository metadata

출력:

- `project evidence pack`
- `company fit pack`
- `source notes`

이 agent는 raw context를 가장 많이 만져도 된다.
다만 raw MCP 응답을 그대로 downstream에 넘기지 않고, 자소서 작성에 필요한 주장/근거/확신도 단위로 재구성해 넘기는 것이 원칙이다.

중요 제약:

- 사용자와 직접 대화하지 않는다
- 다른 agent와 직접 토론하지 않는다
- reviewer/coordinator/drafter에게 질문을 던지지 않는다
- 입력으로 받은 조사 목표 안에서만 독립적으로 수집하고, 정해진 형식의 결과물만 남긴다

### 2. section_coordinator

역할:

- 현재 section 선언
- 활성 ticket 선택
- 이번 라운드 exit criteria 명시
- 다음 owner 지정
- section close / handoff / final-write 판단

출력:

- `Current Section`
- `Current Objective`
- `Must Keep`
- `Must Resolve`
- `Available Evidence`
- `Exit Criteria`
- `Next Owner`

주의:

- 직접 문장을 길게 쓰지 않는다
- 논의 운영과 판정만 담당한다

### 3. section_drafter

역할:

- coordinator가 정의한 section objective를 실제 문장으로 변환
- evidence pack을 반영해 section draft 작성

출력:

- `Section Draft`
- `Change Rationale`

### 4. fit_reviewer

역할:

- 왜 이 회사인가
- 왜 이 직무인가
- 경험이 해당 회사/직무와 정말 연결되는가

출력:

- `Accept / Advisory / Block`
- 회사/직무 적합성 기준에서 남은 gap

### 5. evidence_reviewer

역할:

- 근거 밀도
- 과장 여부
- 구현 책임/운영 책임 명확성
- 수치, 기술, 사실성

출력:

- `Accept / Advisory / Block`
- 부족한 evidence 또는 과장 위험

### 6. voice_reviewer

역할:

- 사람다운 문장 여부
- AI 문장 냄새
- 지원자 목소리와 진정성
- 복붙 가능한 표현 여부

출력:

- `Accept / Advisory / Block`
- tone / voice 관점의 수정 포인트

### 7. finalizer

역할:

- 최종 문단 연결
- 중복 제거
- 글자 수 조정
- 전체 일관성 정리

주의:

- 새로운 근거를 invent 하지 않는다
- researcher와 reviewer가 이미 승인한 범위 안에서만 정리한다

## 최소 추천 버전

처음부터 모든 agent를 넣지 않아도 된다. 가장 작은 안정 구조는 아래다.

- `context_researcher`
- `section_coordinator`
- `section_drafter`
- `fit_reviewer`
- `evidence_reviewer`
- `voice_reviewer`
- `finalizer`

만약 더 줄여야 한다면 `finalizer`는 초기에 `section_drafter`와 합칠 수 있다.

## MCP 접근 정책

### 강한 권장안

`GitHub MCP`, `Notion MCP`, `DART MCP`는 researcher 전용으로 둔다.

repository 로컬 히스토리 접근이 필요하면 그것도 researcher 책임 범위에 둔다.

나머지 agent는 MCP에 직접 접근하지 않고, researcher가 만든 brief만 사용한다.

### 이유

- coordinator가 조사까지 하면 다시 역할이 비대해진다
- drafter/reviewer까지 raw MCP에 접근하면 prompt budget이 불안정해진다
- 각 agent가 서로 다른 사실을 가져와 토론이 흩어질 수 있다
- source provenance를 researcher 한 곳에서 관리하는 편이 안전하다

즉 downstream agent는 `raw source consumer`가 아니라 `normalized brief consumer`가 되어야 한다.

## 리서처 계층 동작 원칙

리서처는 `토론 agent`가 아니라 `사전정보 전처리 agent`다.

권장 동작 방식:

- 여러 researcher가 source별로 병렬 수집
- 각 researcher는 자기 source만 조사
- 조사 중 다른 researcher와 cross-feedback 하지 않음
- 사용자와 직접 상호작용하지 않음
- 최종적으로 정해진 output contract만 제출

즉 research 단계는 `parallel collection pipeline`으로 보고, 이후 drafting/review 단계의 토론과 분리하는 것이 좋다.

### 권장 research topology

- `prompt_normalizer`
- `notion_researcher`
- `github_researcher`
- `dart_researcher`
- `research_synthesizer`

여기서도 원칙은 같다.

- `prompt_normalizer`는 질문 정의만 한다
- `notion_researcher`, `github_researcher`, `dart_researcher`는 병렬 수집만 한다
- `research_synthesizer`는 토론을 열지 않고 결과를 합성만 한다

즉 researcher 계층 전체는 사용자나 다른 agent와 대화하는 계층이 아니라, 조사 입력을 받아 정리된 brief를 배출하는 내부 preprocessing 계층이다.

## GitHub / git source 활용 판단

`GitHub MCP`와 local git history 활용은 강하게 권장한다.

기대 효과:

- 사용자가 실제로 어떤 영역을 담당했는지 추적 가능
- 많이 수정한 파일, 기능 단위, 운영 흔적, 배포 흔적을 근거화 가능
- "내가 뭘 했다"를 기억 의존이 아니라 evidence pack으로 만들 수 있음
- issue / PR / commit 흐름을 통해 프로젝트 맥락과 협업 흔적까지 보강 가능

주의:

- commit 수나 파일 수를 곧바로 기여도로 단정하지 않는다
- commit message만으로 책임을 과대추정하지 않는다
- GitHub 메타데이터를 실제 구현 책임과 동일시하지 않는다
- README, issue, PR 설명, repository overview에 있는 기능 설명을 곧바로 사용자의 개인 기여로 가져오지 않는다
- commit author / committer / PR author / reviewer / code owner를 구분해, 사용자가 실제로 한 일과 팀이 한 일을 분리해야 한다
- 사용자가 직접 하지 않은 구현, 운영, 의사결정을 개인 성과처럼 서술하지 않는다

researcher는 GitHub / git 정보를 아래처럼 정리하는 것이 좋다.

- 프로젝트명
- 기간 추정
- 주로 만진 영역
- 대표 기능 3개
- 운영/배포 흔적
- 자소서에 쓸 수 있는 주장 후보

가능하면 source notes에는 아래 provenance를 함께 남긴다.

- repo / branch / commit range
- 관련 PR / issue / discussion
- author / owner attribution 메모
- 신뢰도 메모

### GitHub attribution 원칙

- repository 전체 기능 설명과 개인 기여 설명을 구분한다
- README에 있는 기능은 기본적으로 `프로젝트 수준 사실`로만 취급한다
- 개인 기여로 승격하려면 최소한 commit, PR, review trail, ownership 흔적 중 하나가 있어야 한다
- 동일 기능이라도 사용자의 commit author가 확인되지 않으면 `팀 구현`, `프로젝트 기능`, `간접 참여 가능성` 수준으로 낮춰 기록한다
- 불확실하면 더 약한 표현으로 남기고 downstream에 confidence를 낮게 전달한다

## DART MCP 활용 판단

`DART MCP`도 회사 정보 추출용으로 유효하다.

기대 효과:

- 회사의 공식 사업 방향과 전략 표현 확보
- 생활금융, 플랫폼, 디지털 전환 같은 기업 방향을 블로그가 아니라 공식 문맥으로 잡을 수 있음
- "왜 이 회사인가"를 더 안전하게 닫을 수 있음

주의:

- DART 정보는 상위 레벨이라 그대로 쓰면 자소서 문장이 딱딱해질 수 있음
- researcher가 "원문 요약"이 아니라 "자소서에 쓸 수 있는 주장 + 근거 + 확신도"로 변환해야 함
- 회사가 DART 등록 대상이 아니거나 조회되지 않으면 실패로 간주하지 않고 조용히 pass해야 함
- 이 경우 company fit pack은 Notion, GitHub, 사용자 제공 정보, 일반 회사 정보 source로 계속 구성할 수 있어야 함

researcher는 DART 정보를 아래처럼 정리하는 것이 좋다.

- 회사 핵심 방향 3개
- 지원 직무와 연결 가능한 공식 근거
- 쓰면 안 되는 과장 표현
- 자소서용 안전 문장 후보

### DART fallback 원칙

- DART에 등록된 회사면 공식 사업 방향 source로 활용한다
- DART에 등록되지 않았거나 검색 결과가 없으면 해당 source는 `not available`로만 기록하고 종료한다
- 이 경우 researcher는 에러를 전파하거나 토론을 중단하지 않는다
- downstream agent에도 "DART 근거 없음 = 문제"처럼 전달하지 않고, 단지 공식 공시 근거가 없다는 provenance만 남긴다

## Notion source 활용 판단

`Notion MCP`는 사용자가 이미 정리해 둔 초안, 경험 메모, 회사별 포지셔닝, 이전 문항 간 일관성을 회수하는 데 유효하다.

기대 효과:

- 현재 문항 초안과 다른 문항 초안의 톤 일관성 확보
- 사용자가 이미 정리한 판단 기준 복원
- 프로젝트 메모, 회고, 준비 자료를 근거 pack으로 승격 가능

주의:

- 노션 문구를 그대로 자소서 문장으로 복제하지 않는다
- 오래된 메모와 현재 사실이 충돌할 수 있으면 source notes에 불확실성을 남긴다
- 노션에 적혀 있다고 해서 곧바로 사용자의 직접 기여 사실로 확정하지 않는다
- 회고/정리 문서의 서술 주체와 실제 수행 주체가 다를 수 있음을 감안해야 한다

researcher는 Notion 정보를 아래처럼 정리하는 것이 좋다.

- 현재 문항과 직접 연결되는 page 1순위
- 보강 근거로만 쓸 page
- 전체 자소서 포지셔닝과 연결되는 반복 축
- 이번 섹션에 실제로 쓸 수 있는 안전한 요약

### Notion attribution 원칙

- 노션 문서는 `개인 메모`, `팀 기록`, `정리 문서`, `초안`을 구분해 읽어야 한다
- 사용자가 작성한 페이지인지, 팀 공용 문서인지, 제3자가 정리한 내용인지 source notes에 남긴다
- 사용자가 직접 하지 않은 일을 노션 문구만 보고 개인 수행 사실로 끌어오지 않는다
- 개인 기여로 쓰려면 GitHub 흔적, 사용자 명시, 또는 문서 내 명확한 attribution이 함께 있어야 한다

## `agent_name.json`에 담아야 할 계약

각 agent는 단순 persona가 아니라 계약을 가져야 한다.

권장 필드:

- `schemaVersion`
- `name`
- `displayName`
- `kind`
- `role`
- `description`
- `mission`
- `execution`
- `tools`
- `inputs`
- `outputs`
- `constraints`
- `success`

현재 저장소 기준으로는 위 필드를 아래처럼 구조화해 두는 것이 좋다.

- `execution`
  - `visibility`
  - `interactionMode`
  - `parallelSafe`
  - `writesFinalProse`
- `tools`
  - `allowed`
  - `forbidden`
- `inputs`
  - `required`
  - `optional`
- `outputs`
  - `format`
  - `sections`
  - `mustInclude`
- `constraints`
  - `forbiddenActions`
  - `requiredBehaviors`
- `success`
  - `criteria`

예시 원칙:

- `context_researcher.json`
  - `GitHub MCP`, `Notion MCP`, `DART MCP`, local git access 허용
  - 사용자/다른 agent와 직접 대화 금지
  - 글쓰기 금지
  - structured brief만 출력
  - source provenance 필수
- `section_coordinator.json`
  - 새 사실 발굴 금지
  - 긴 prose draft 작성 금지
  - section objective와 closure decision만 출력
- `section_drafter.json`
  - researcher brief와 coordinator objective 밖의 주장 금지
  - 문장 작성 책임만 가짐
- `*_reviewer.json`
  - 자기 담당 렌즈 밖의 판단 최소화
  - accept / advisory / block와 조건만 반환
- `finalizer.json`
  - 새 근거 도입 금지
  - 길이/중복/흐름 정리만 허용

## 권장 산출물 형식

### researcher

- `Project Evidence Pack`
- `Company Fit Pack`
- `Source Notes`

`Source Notes`는 최소한 다음을 포함하는 것이 좋다.

- source type: GitHub / Notion / DART / local git
- source locator: page, repo, PR, commit, filing
- attribution: self / team / unknown
- reusable claim
- confidence

## 운영 규칙 파일 구조 권장안

자소서 작성 시 유의사항, agent 역할, 기계 적용 규칙을 한 파일 형식에 몰아넣는 것은 권장하지 않는다.

권장 구조는 아래 4층이다.

- `AGENTS.md`
- `agents/*.json`
- `agents/*.md`
- `rules/essay_rules.json`

### 1. `AGENTS.md`

용도:

- 사람이 읽는 상위 운영 원칙
- 자소서 작성 전체 규칙
- 에이전트 공통 행동 원칙
- 왜 이런 규칙이 필요한지에 대한 설명

여기에 넣기 좋은 내용:

- 근거 없는 과장 금지
- 회사/직무 적합성 판단 기준
- 경험을 사실보다 크게 해석하지 말 것
- AI 냄새가 나는 표현 금지 예시
- 문항별 흔한 실패 패턴
- source provenance 우선순위
- 충돌 시 우선순위 규칙

### 2. `agents/*.json`

용도:

- agent별 역할 계약
- 코드가 직접 읽는 source of truth
- execution / tools / inputs / outputs / constraints / success 정의
- 런타임 로더와 타입 검증 대상

여기에 넣기 좋은 내용:

- `context_researcher.json`
- `section_coordinator.json`
- `section_drafter.json`
- `fit_reviewer.json`
- `evidence_reviewer.json`
- `voice_reviewer.json`
- `finalizer.json`

### 3. `agents/*.md`

용도:

- 각 `agents/*.json`에 대한 개발자용 한글 설명 문서
- 필드 의미, 설계 의도, 운영 시 주의점 정리
- 주석이 없는 JSON을 사람이 이해하기 쉽게 보완

여기에 넣기 좋은 내용:

- `context_researcher.md`
- `section_coordinator.md`
- `section_drafter.md`
- `fit_reviewer.md`
- `evidence_reviewer.md`
- `voice_reviewer.md`
- `finalizer.md`

### 4. `rules/essay_rules.json`

용도:

- 코드가 읽을 수 있는 구조화 규칙
- 자동 검증과 prompt assembly에 쓸 규칙
- forbidden pattern, required check, confidence level 같은 기계적 규칙

여기에 넣기 좋은 내용:

- 금지 표현 목록
- 필수 점검 항목
- confidence 레벨
- source priority
- evidence strength rules

## 형식 선택 판단

### `AGENTS.md`만 사용하는 경우

장점:

- 사람이 읽고 수정하기 쉽다
- 규칙의 의도와 예시를 풍부하게 설명할 수 있다

단점:

- 코드에서 직접 사용하기 어렵다
- 자동 검사나 prompt 주입 규칙으로 재활용하기 어렵다

### `JSON`만 사용하는 경우

장점:

- 코드가 읽기 쉽다
- 자동 적용에 유리하다

단점:

- 사람이 관리하기 불편하다
- 자소서 규칙처럼 뉘앙스가 많은 내용을 담기 어렵다

### `JSON + MD`를 함께 사용하는 경우

장점:

- JSON은 런타임 source of truth로 쓰기 쉽다
- MD는 설계 의도와 운영 맥락을 설명하기 좋다
- 역할 계약과 설명 문서를 분리해 유지보수가 쉽다

단점:

- 파일 수가 늘어난다
- JSON과 MD 사이의 동기화가 필요하다

## 최종 권장안

규칙은 한 형식으로 통일하기보다 책임을 나눠야 한다.

- `AGENTS.md` = 상위 원칙과 설명
- `agents/*.json` = agent별 역할 계약
- `agents/*.md` = agent JSON 설명 문서
- `rules/essay_rules.json` = 코드가 읽는 구조화 규칙

즉:

- `MD`는 사람과 agent가 함께 읽는 운영 헌법
- `agents/*.json`은 역할 설정
- `agents/*.md`는 개발자 설명 레이어
- `JSON`은 자동 적용 레이어

### Source of truth 권장

- 최상위 정책 source of truth는 `AGENTS.md`
- agent별 오퍼레이션 source of truth는 `agents/*.json`
- agent별 설명 source of truth는 `agents/*.md`
- 자동 검증 / prompt assembly 규칙 source of truth는 `rules/essay_rules.json`

### coordinator

- `Current Section`
- `Current Objective`
- `Must Keep`
- `Must Resolve`
- `Available Evidence`
- `Exit Criteria`
- `Next Owner`

### drafter

- `Section Draft`
- `Change Rationale`

### reviewer

- `Judgment: ACCEPT | ADVISORY | BLOCK`
- `Reason`
- `Condition To Close`

### finalizer

- `Final Draft`
- `Final Checks`

## 단계적 전환 권장 순서

### Phase 1

- researcher를 coordinator에서 분리
- coordinator의 raw Notion lookup 역할 제거
- researcher brief를 새로운 source of truth로 도입

### Phase 2

- coordinator에서 `Mini Draft`를 제거하거나 `Rewrite Direction` 수준으로 축소
- `section_drafter` 도입

### Phase 3

- reviewer를 역할별 output contract로 강화
- finalizer 도입

## 실사용 시나리오 문서

실제 운영 흐름과 분기 예시는 별도 문서로 분리하는 편이 관리에 더 적합하다.

- 시나리오 문서: `docs/plans/2026-04-03-agent-role-architecture-scenarios.md`
- 이 문서에는 기본 흐름, blocker 발생 흐름, 사용자 체감 흐름을 따로 정리한다

## UI 설계 문서

역할 구조를 실제 `Runs` 탭 UI에 어떻게 투영할지는 별도 UI 문서로 분리하는 편이 적합하다.

- UI 문서: `docs/plans/2026-04-03-role-based-runs-ui-design.md`
- 이 문서에는 역할 배치 UI, provider 기본값 상속, 고급 옵션 override, preset 방향을 정리한다

## 최종 권장안

핵심은 coordinator를 더 똑똑하게 만드는 것이 아니라 더 좁게 만드는 것이다.

다음 단계의 이상적인 구조는:

- researcher가 사실과 근거를 모으고
- coordinator가 section과 exit criteria를 관리하고
- drafter가 문장을 쓰고
- reviewer가 각자의 렌즈로 비평하고
- finalizer가 마지막 통합을 맡는 구조다

이 구조라면 realtime 토론은 더 이상 "코디네이터가 먼저 쓴 문장을 여러 리뷰어가 수정하는 체계"가 아니라, "근거 수집 -> section 운영 -> 초안 작성 -> 역할별 검증 -> 최종 통합"의 생산 파이프라인에 가까워진다.
