# Provider Settings And Selection UI Design

## Goal
`Providers` 탭에서 각 provider의 `model`과 `effort`를 설정할 수 있게 하고, `Runs`, `Profile`, `Projects`에서 세로 체크박스 위주의 선택 UI를 가로형 선택 카드/토글로 바꿔 공간 낭비를 줄인다.

## Confirmed Support
- `Claude Code`
  - `--model <model>` 지원
  - `--effort <level>` 지원
  - 로컬 `claude --help`로 확인
- `Codex`
  - `-m, --model <MODEL>` 지원
  - reasoning effort는 공개 CLI 플래그가 아니라 config key 기반으로 보이며, 바이너리 문자열에 `model_reasoning_effort`가 포함됨
  - 따라서 ForJob에서는 `-c model_reasoning_effort="<value>"` 방식으로 연결
- `Gemini`
  - `-m` / `--model` 지원
  - 설치된 README와 소스 테스트에서 확인
  - 사용자용 `effort` CLI 옵션은 현재 확인되지 않았으므로 v1에서는 `Not supported` 처리

## UX Direction
- `Providers`
  - 각 provider 카드에 `Model` 드롭다운 추가
  - 드롭다운 마지막 항목은 `Custom...`
  - `Custom...` 선택 시 직접 모델명을 입력하는 필드 노출
  - `Effort`는 지원 provider만 드롭다운 활성화
  - 비지원 provider는 비활성 셀렉트와 설명 문구 표시
- `Runs`
  - provider 선택을 세로 체크박스 목록에서 가로형 선택 카드로 변경
  - 추가 문서 선택도 같은 카드 패턴으로 변경
- `Profile` / `Projects`
  - 문서 카드의 `Pin by default`를 우측 토글칩으로 변경
  - 입력 폼의 `Pin by default`도 인라인 토글로 변경

## Data / Configuration
- workspace config에 provider별 설정 추가
  - `forjob.providers.codex.model`
  - `forjob.providers.codex.effort`
  - `forjob.providers.claude.model`
  - `forjob.providers.claude.effort`
  - `forjob.providers.gemini.model`
- `gemini.effort`는 추가하지 않음
- 빈 문자열은 “기본값 사용”으로 해석
- webview state에는 현재 설정값과 provider capability metadata를 포함

## Execution Layer
- `ProviderRegistry`에 getter/setter 추가
- `listRuntimeStates()`에서 provider별 설정값과 capability를 함께 반환
- `buildArgs()`는 provider별 설정을 읽어 실행 인자에 반영
  - Codex: `-m`, `-c model_reasoning_effort="..."`
  - Claude: `--model`, `--effort`
  - Gemini: `-m`

## Testing
- provider args 생성 테스트 추가
- provider runtime state에 설정값/capability가 노출되는지 검증
- webview 렌더링 로직은 구조가 단일 파일이라 smoke-style 테스트 대신 기존 앱 테스트와 수동 확인 중심
- 전체 `npm run test` 통과 유지
