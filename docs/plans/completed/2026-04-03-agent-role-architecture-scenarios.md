# Agent Role Architecture Scenarios

## 목적

이 문서는 `2026-04-03-agent-role-architecture-design.md`에서 정의한 역할 구조가 실제 자소서 작성 흐름에서 어떻게 작동하는지 보여 주는 운영 시나리오 문서다.

설계 문서는 역할과 계약을 설명하고, 이 문서는 실제 실행 순서와 분기 방식을 설명한다.

## 시나리오 A: 한 문항을 한 section씩 닫아 가는 기본 흐름

가정:

- 사용자는 "왜 이 회사와 이 직무에 지원했는가" 문항을 작성하려 한다
- 선택된 source는 GitHub 저장소, Notion 메모, 회사 관련 공식 자료다
- 이번 라운드에서 먼저 닫을 section은 `지원 동기`다

초기 입력:

- essay question
- 현재 draft
- selected documents
- target company / target role
- user guidance

### 1. research 단계

먼저 `context_researcher`가 source를 읽고 아래처럼 정리된 brief를 만든다.

- `Project Evidence Pack`
  - 사용자가 실제로 많이 관여한 프로젝트
  - 개인 기여로 안전하게 주장할 수 있는 기능
  - 구현 책임과 운영 책임이 구분된 근거
- `Company Fit Pack`
  - 회사가 공식적으로 강조하는 방향
  - 해당 직무와 연결 가능한 사업/제품/기술 맥락
  - 쓰면 위험한 과장 표현
- `Source Notes`
  - GitHub / Notion / DART / local git별 provenance
  - self / team / unknown attribution
  - claim별 confidence

이 단계의 핵심은 "글을 쓰는 것"이 아니라 "무슨 말을 안전하게 해도 되는지 확정하는 것"이다.

### 2. coordinator 오픈

`section_coordinator`는 research brief와 현재 문항 상태를 보고 이번 라운드의 작업 범위를 좁힌다.

예시 출력:

- `Current Section`: 지원 동기
- `Current Objective`: 사용자의 실제 프로젝트 경험이 왜 이 회사의 직무와 연결되는지 4~5문장 안에서 설명
- `Must Keep`: 결제/정산/안정성 관련 실제 경험 1개
- `Must Resolve`: 회사 칭찬만 있고 사용자의 경험 연결이 약한 문제
- `Available Evidence`: researcher brief에서 사용 가능한 claim 3개
- `Exit Criteria`: 회사 방향, 직무 연결, 개인 경험 연결이 모두 문장 안에 드러날 것
- `Next Owner`: `section_drafter`

여기서 coordinator는 아직 문단을 쓰지 않는다. "이번에 무엇을 닫을지"만 정한다.

### 3. drafter 초안 작성

`section_drafter`는 위 objective와 evidence만 사용해 실제 자소서 문장을 쓴다.

예시 출력:

- `Section Draft`
  - 결제 안정성이나 사용자 경험 개선과 관련된 자신의 경험을 1개 고른다
  - 그 경험이 지원 회사의 방향과 왜 맞는지 연결한다
  - 지원 직무에서 어떤 방식으로 기여할지를 정리한다
- `Change Rationale`
  - 어떤 evidence를 썼는지
  - 어떤 쟁점을 해결했는지
  - 아직 약한 지점이 무엇인지

이제부터 reviewer는 coordinator 문장을 고치는 것이 아니라, drafter가 만든 section draft를 각자 자기 렌즈로 평가한다.

### 4. reviewer 병렬 검토

세 reviewer는 같은 draft를 보되 각자 다른 질문만 본다.

`fit_reviewer`

- 회사와 직무 연결이 진짜 설득력 있는가
- 그냥 아무 회사에도 붙일 수 있는 문장 아닌가

예시 출력:

- `Judgment`: ADVISORY
- `Reason`: 회사 방향은 언급됐지만 왜 이 직무여야 하는지가 약함
- `Condition To Close`: 운영 경험보다 직무 기여 방식이 더 직접 드러나게 수정할 것

`evidence_reviewer`

- 개인 기여와 팀 결과가 섞이지 않았는가
- 과장처럼 읽히는 표현은 없는가

예시 출력:

- `Judgment`: ACCEPT
- `Reason`: 사용자의 책임 범위가 비교적 안전하게 표현됨
- `Condition To Close`: 없음

`voice_reviewer`

- 사람다운 문장인가
- AI 템플릿 냄새가 나는가

예시 출력:

- `Judgment`: ADVISORY
- `Reason`: "가치를 더하고 싶다", "성장에 기여하겠다" 같은 복붙형 표현이 남아 있음
- `Condition To Close`: 추상적 포부를 실제 경험 기반 표현으로 바꿀 것

### 5. coordinator 재판정

reviewer 결과를 받은 `section_coordinator`는 다시 scope를 좁힌다.

예시 판단:

- evidence는 충분하므로 research로 되돌아갈 필요는 없음
- fit와 voice 이슈는 drafting 수정으로 해결 가능
- `Next Owner`를 다시 `section_drafter`로 지정

이 단계에서 coordinator는 "무엇을 다시 써야 하는지"만 정리하고, 직접 rewrite를 수행하지 않는다.

### 6. drafter 재작성

`section_drafter`는 reviewer 조건을 반영해 수정한다.

수정 방향 예시:

- 직무 연결이 더 직접적으로 보이도록 "내 경험 -> 직무 기여 방식" 연결 강화
- generic phrase를 줄이고 실제 경험 문장으로 교체

### 7. reviewer 재확인과 section close

수정본에 대해 reviewer가 다시 본다.

- `fit_reviewer`: ACCEPT
- `evidence_reviewer`: ACCEPT
- `voice_reviewer`: ACCEPT 또는 ADVISORY

`section_coordinator`는 exit criteria 충족 여부를 보고 section을 닫는다.

예시:

- `Current Section`: 지원 동기
- `Section Outcome`: close
- `Next Owner`: 다음 section의 drafter 또는 finalizer

즉 실제 논의는 "coordinator 초안 -> reviewer 수정"이 아니라 아래 순서로 흐른다.

- researcher가 근거 범위를 정하고
- coordinator가 이번에 닫을 쟁점을 고르고
- drafter가 실제 문장을 쓰고
- reviewer가 각자 다른 렌즈로 비평하고
- coordinator가 다시 다음 owner를 지정하고
- 조건이 충족되면 section을 닫는다

## 시나리오 B: evidence blocker가 발생하는 흐름

이번에는 drafter가 조금 더 강한 문장을 썼다고 가정한다.

예시 문장:

- "제가 주도적으로 서비스 안정성을 확보했고, 핵심 결제 흐름 개선을 이끌었습니다."

그런데 research brief를 보면:

- 안정성 개선 작업에는 직접 관여했지만
- "핵심 결제 흐름 개선을 이끌었다"는 표현은 attribution이 약하다
- 해당 기능은 팀 단위 결과일 가능성이 높다

이때 `evidence_reviewer`는 아래처럼 막는다.

- `Judgment`: BLOCK
- `Reason`: 팀 수준 성과가 개인 주도 성과처럼 읽힌다
- `Condition To Close`: 개인이 실제로 맡은 범위와 팀 성과를 분리해서 다시 쓸 것

이 경우 coordinator 판단은 다음과 같다.

- drafting 문제인지, research 부족 문제인지 먼저 구분
- source notes에 이미 충분한 provenance가 있으면 drafter로 되돌림
- source notes 자체가 약하면 researcher에 추가 조사 요청

가능한 흐름 1:

- `Next Owner`: `section_drafter`
- 이유: evidence는 이미 있지만 문장 표현이 과장됨

가능한 흐름 2:

- `Next Owner`: `context_researcher`
- 이유: self / team attribution이 아직 불분명함

이 시나리오에서 중요한 점은 `BLOCK`이 나오더라도 모두가 한꺼번에 다시 토론하지 않는다는 것이다.

- 근거가 약하면 researcher로
- 문장만 과하면 drafter로
- 회사/직무 연결만 약하면 fit reviewer 지적을 반영하는 방향으로

즉 blocker의 종류에 따라 다음 owner가 분기된다.

## 이 구조에서의 사용자 체감

사용자 입장에서는 여러 agent가 떠들썩하게 한 문장을 동시에 고치는 느낌보다, 아래처럼 단계가 보이는 경험에 가깝다.

1. 먼저 쓸 수 있는 근거와 못 쓰는 근거가 정리된다
2. 이번 라운드에서 무엇을 고칠지 coordinator가 좁혀 준다
3. 실제 문장은 drafter가 쓴다
4. reviewer는 각자 자기 기준으로만 검사한다
5. 조건이 충족되면 section이 닫히고 다음 section으로 넘어간다

즉 실사용에서는 "토론"이라기보다 "근거 기반 drafting pipeline"처럼 느껴지는 것이 정상이다.
