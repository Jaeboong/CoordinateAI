# ForJob

ForJob은 자소서와 지원서 초안을 다듬기 위해 만든 개인용 VS Code 확장입니다. 공통 프로필 자료와 회사별 프로젝트 자료를 워크스페이스 안에 투명하게 저장하고, `Codex`, `Claude Code`, `Gemini CLI`를 이용해 여러 AI가 함께 피드백을 주고받도록 실행합니다.

## 개요

- 공통 프로필 자료 저장
  경력, 학력, 자격증, 경험, 포트폴리오 요약 등을 한 번 넣어두고 여러 프로젝트에서 재사용합니다.
- 회사별 프로젝트 관리
  예를 들어 `신한은행 지원`, `카카오 지원`처럼 회사별 프로젝트를 따로 만들고, 각 프로젝트 전용 문서와 평가 기준을 관리합니다.
- 다중 AI 피드백 실행
  문항과 현재 초안을 넣으면 선택한 AI들이 세션처럼 계속 피드백을 주고받고, 각 cycle마다 조정자 모델이 현재 요약과 수정 초안을 갱신합니다.

## 개발 환경에서 실행하기

1. 터미널에서 의존성을 설치합니다.

```bash
npm install
```

`npm install`을 실행하면 ForJob 의존성과 함께 `Codex CLI`, `Gemini CLI`가 설치되어 있지 않을 경우 전역 설치를 자동으로 시도합니다. 이미 설치되어 있으면 건너뜁니다.

WSL 환경에서는 주의할 점이 있습니다.

- `Windows npm`이 아니라 `WSL 안의 Linux node/npm`으로 설치해야 합니다.
- 전역 npm prefix가 `/mnt/c/...`처럼 Windows 경로라면 자동 설치를 건너뜁니다.
- 이 경우 `nvm` 등으로 WSL 안에 Node.js를 설치한 뒤 다시 `npm run setup:providers`를 실행하세요.

2. 테스트를 실행해 기본 동작을 확인합니다.

```bash
npm run test
```

WSL에 설치된 확장을 현재 저장소 빌드로 다시 적용하려면, 이제 수동 폴더 복사가 아니라 VSIX 하네스를 사용합니다.

```bash
./scripts/package-vsix.sh
./scripts/install-wsl-extension.sh
./scripts/verify-wsl-extension.sh
```

평소에는 아래 한 줄이면 충분합니다.

```bash
./scripts/deploy-wsl-extension.sh
```

이 명령은 `build -> test -> VSIX 생성 -> WSL 설치 -> 버전 검증`까지 수행합니다. 설치가 끝나면 VS Code에서 `Developer: Reload Window`를 한 번 실행하면 됩니다.

참고:

- 같은 흐름은 `package.json`에도 `package:vsix`, `install:wsl-extension`, `verify:wsl-extension`, `deploy:wsl-extension` 스크립트 alias로 연결되어 있습니다.
- 다만 일부 WSL 환경에서는 `npm` shim이 깨져 있을 수 있으므로, 저장소 기본 하네스는 위의 `./scripts/*.sh` 직접 실행 경로를 기준으로 문서화합니다.

3. VS Code에서 이 폴더를 연 뒤 `Run and Debug` 화면에서 `Run ForJob Extension`을 실행합니다.
4. 또는 `F5`를 눌러 같은 디버그 구성을 바로 실행할 수 있습니다.
5. 새로 열린 Extension Host 창의 왼쪽 액티비티 바에서 `ForJob` 아이콘을 클릭합니다.

WSL에서 디버그할 때는 VS Code 공식 제약이 있습니다.

- `Extension Development Host` 창은 확장 소스 폴더 자체를 바로 다시 열 수 없습니다.
- 즉 `forJob` 소스 폴더를 새 창에서 자동으로 다시 여는 방식은 WSL 디버그 구조상 기대대로 동작하지 않을 수 있습니다.
- 대신 확장은 현재 열린 원격 환경에서 정상 실행되고, ForJob 안의 `Open storage root` 버튼으로 실제 저장 폴더를 바로 열 수 있습니다.

## 사용 방법

### 1. 설정 모달

상단 `설정` 버튼을 누르면 모달 안에서 `AI 도구`, `OpenDART`, `프로필`을 관리할 수 있습니다.

#### AI 도구

- 기본 인증 방식은 `CLI login`입니다.
- `codex`, `claude`, `gemini`가 로컬에 설치되어 있어야 합니다.
- 각 CLI에서 미리 로그인한 뒤 `Test Connection` 버튼으로 연결 상태를 확인합니다.
- 필요하면 provider별로 `API key` 모드로 전환해서 키를 저장할 수 있습니다.
- provider별 `Model` 드롭다운에서 추천 모델을 고를 수 있고, `Custom...`을 선택하면 직접 모델명을 입력할 수 있습니다.
- `Claude Code`는 `Effort`도 설정할 수 있습니다.
- `Codex`는 `model`과 reasoning `effort`를 설정할 수 있습니다.
- `Gemini`는 현재 `model` 선택만 제공하고, `effort`는 노출하지 않습니다.
- provider 카드의 `Connect Notion` 버튼은 해당 CLI에 공식 Notion MCP preset을 연결하도록 도와줍니다.
- `Connect Notion`을 누르면 터미널이 열리고 provider별 MCP 추가 또는 OAuth 로그인 명령이 실행됩니다.
- 연결 후에는 `Check Notion MCP`로 해당 provider에서 Notion MCP가 보이는지 확인합니다.
- Notion MCP 상태는 `Check Notion MCP`, Notion 연결/해제 액션, `ForJob: Refresh` 때 갱신되고 그 사이에는 캐시되어 UI가 불필요하게 느려지지 않도록 합니다.

참고:

- `npm install`은 `codex`, `gemini`가 없으면 자동 설치를 시도합니다.
- `claude`는 자동 설치 대상이 아니므로 별도로 준비되어 있어야 합니다.
- 자동 설치가 실패해도 ForJob 자체 설치는 계속 완료됩니다.
- WSL에서는 `~/.nvm/.../bin/codex`, `~/.nvm/.../bin/gemini` 같은 Linux 쪽 CLI를 우선 사용합니다.
- 필요하면 수동으로 다시 실행할 수 있습니다.

```bash
npm run setup:providers
```

설치 후에도 설정 모달의 `AI 도구` 화면에 안 보이면 VS Code를 완전히 껐다가 다시 열고, Extension Host를 다시 실행하세요. 로그인 셸의 PATH가 새로 반영되어야 할 수 있습니다.

#### 프로필

설정 모달의 `프로필` 화면에는 모든 프로젝트에 공통으로 쓰일 자료를 넣습니다.

- 파일 가져오기: `txt`, `md`, `pdf`, `pptx`, 이미지 파일
- `Import files` 버튼은 웹뷰 안의 파일 선택창을 사용하므로, WSL에서도 VS Code 원격 탐색기 대신 로컬 파일 선택창으로 가져오는 흐름에 더 가깝게 동작합니다.
- 텍스트 직접 입력: 경력 요약, 경험 정리, 강점 메모 등
- `Pin by default`를 켜면 이후 실행에서 기본 포함 문서로 사용됩니다.
- `Pin by default`는 인라인 토글로 바로 켜고 끌 수 있습니다.

예시:

- 이력서 요약
- 프로젝트 경험 정리
- 자격증 목록
- 성과 수치 모음

#### OpenDART

설정 모달의 `OpenDART` 화면에서 공식 OpenDART REST API 키를 저장하고, `연결 확인`으로 실제 API 요청 성공 여부를 검사할 수 있습니다.

- 키는 워크스페이스 파일이 아니라 VS Code `SecretStorage`에 저장됩니다.
- 키가 없으면 공고 기반 인사이트만 생성합니다.
- 키가 있으면 기업개황, 최근 연간 재무 요약 등 공식 공시 기반 정보를 함께 반영합니다.
- OpenDART 매칭 후보가 여러 개면 후보를 고른 뒤 다시 생성해야 합니다.

### 3. Projects 탭

`Projects` 탭에서는 회사별 지원 프로젝트를 만들고, 선택한 프로젝트의 세부 내용을 관리합니다.

- 새 프로젝트에서는 우선 `지원 공고 URL`과 `에세이 문항`만 입력
- 회사명과 지원 직무는 공고 분석 후 자동 추출, 필요하면 검토 단계에서 수정
- 프로젝트 삭제 가능
- `공고 분석`으로 공고 텍스트를 구조화하고 검토 가능한 필드로 채워넣기
- `인사이트 생성`으로 사전 분석 문서를 프로젝트 문서로 생성
- 생성 후 `인사이트 열기`로 메인 에디터 영역의 전용 인사이트 화면 열기
- 회사 분석 메모, 채용공고 요약, 직무 적합성 메모 등 프로젝트 전용 자료 추가
- 프로젝트별 루브릭 수정 가능
- 프로젝트 문서별 `pin`, 수정, 삭제 가능

인사이트 프리패스는 다음 순서로 동작합니다.

1. 프로젝트에 공고 URL과 에세이 문항을 입력합니다.
2. `공고 분석`을 누르면 지원 공고를 가져와서 다음 필드를 자동 추출합니다.
   - 회사명
   - 역할명
   - 주요 업무
   - 자격요건
   - 우대사항
   - 키워드 / 기술 스택
3. 자동 추출 결과를 사용자가 직접 수정하거나 보완합니다.
4. URL 분석이 실패하면 그때만 `공고 원문 붙여넣기` 칸이 열립니다.
5. 필요하면 설정 모달의 `OpenDART` 화면에서 API 키를 저장합니다.
6. `인사이트 생성`을 누르면 다음 문서가 프로젝트 문서로 생성되고 기본 포함 문서로 pin 됩니다.
   - `company-insight.md`
   - `job-insight.md`
   - `application-strategy.md`
   - `question-analysis.md`
7. 생성이 끝나면 메인 에디터 영역에 전용 인사이트 화면이 열리고, 탭으로 `기업 분석`, `직무 분석`, `지원 전략`, `문항 분석`을 볼 수 있습니다.
8. 이후 `Runs` 탭 실행에서는 위 인사이트 문서가 자동으로 컨텍스트에 포함됩니다.

인사이트 문서는 전용 화면으로도 볼 수 있지만, 실제 파일은 기존 프로젝트 문서 흐름에 저장됩니다. 그래서 일반 프로젝트 문서처럼 열어서 편집하거나, 필요하면 다시 생성할 수 있습니다.

프로젝트 문서 편집 규칙은 다음과 같습니다.

- `text`, `txt`, `md` 문서는 제목 / 메모 / pin / 본문 수정 가능
- `pdf`, `pptx`, 이미지 같은 가져온 파일은 제목 / 메모 / pin 수정과 삭제를 지원
- 파일 내용 자체를 바꾸고 싶으면 기존 파일을 삭제하고 다시 가져오면 됩니다.

예시:

- `신한은행` 프로젝트
- `카카오` 프로젝트

### 공고 분석 실패 시

- 공고 URL을 읽지 못하면 프로젝트 화면에서 `공고 원문 붙여넣기` 칸이 자동으로 열리고, 직접 텍스트를 넣어 계속 진행할 수 있습니다.
- 자동 추출이 불완전해도 사용자가 필드를 직접 고친 뒤 인사이트를 생성할 수 있습니다.
- OpenDART 조회가 실패하거나 데이터가 부족해도 인사이트 생성은 계속 진행되고, 문서 안에 부분 데이터 안내가 남습니다.

### 4. Runs 탭

`Runs` 탭에서 실제 자소서 피드백을 실행합니다.

1. `Runs` 탭 안에서 기반 프로젝트를 선택합니다.
2. 자소서 문항을 입력합니다.
3. 현재 작성한 초안을 입력합니다.
4. 필요하면 `Notion request`에 자연어로 참고 요청을 입력합니다.
5. `역할 배치`에서 각 top-level 역할에 어떤 provider를 붙일지 정합니다.
6. 기본값으로는 provider의 전역 `model / effort` 설정을 그대로 상속합니다.
7. 필요하면 `고급 옵션`에서 역할별 `model / effort override`를 켤 수 있습니다.
8. 이번 실행에서만 추가로 포함할 문서를 선택합니다.
9. `실행`을 눌러 시작합니다.

기본적으로 노출되는 역할은 다음과 같습니다.

- `Context Researcher`
- `Section Coordinator`
- `Section Drafter`
- `Fit Reviewer`
- `Evidence Reviewer`
- `Voice Reviewer`
- `Finalizer`

즉 `Runs` 탭은 "이번 실행에서 어떤 AI가 어떤 역할을 맡는가"를 정하고, 각 provider의 기본 모델 선택은 `Providers` 탭에서 관리하는 구조입니다.

`고급 옵션`을 열면 각 역할에 대해 다음 override를 설정할 수 있습니다.

- `Provider 기본 설정 사용`
- `Model override`
- `Effort override`

예시:

- `CJ 올리브네트웍스 페이지 가져와서 파악해`
- `신한은행 관련 노션 자료 찾아서 핵심만 반영해`

`Notion request`를 입력하면 `Context Researcher` 역할에 배치된 provider가 자신의 Notion MCP를 사용해 먼저 `Notion Brief`를 만듭니다. reviewer들은 노션을 직접 탐색하지 않고, researcher가 만든 brief를 공통 참고자료처럼 받아서 토론합니다.

실행 중 화면은 두 영역으로 나뉩니다.

- `Conversation`
  AI의 자연어 발화를 채팅처럼 보여줍니다. 스트리밍 중에는 plain text로 보이고, 메시지가 완료되면 Markdown 형식으로 읽기 좋게 렌더링됩니다.
- `System stream`
  raw stdout/stderr, tool call, MCP 호출, turn 시작/종료 같은 디버그 이벤트를 더 작은 접힘 패널에서 따로 보여줍니다.
- `Session pause`
  각 cycle이 끝날 때 자동으로 잠깐 멈춥니다. 이때 입력창에서 메모를 남기면 다음 cycle에 반영되고, 비워둔 채 `Enter`를 누르면 그대로 계속 진행합니다. ` /done `을 입력하면 현재 결과를 유지한 채 세션을 멈춥니다.

추가로 `Notion request`가 있을 때 coordinator의 `round 0` 조사 멘트는 메인 대화창에 길게 누적하지 않고, 마지막 조사 결과만 남도록 정리됩니다.

세션은 고정 라운드 수로 끝나지 않습니다.

- 각 cycle마다 `summary.md`, `improvement-plan.md`, `revised-draft.md`가 새로 갱신됩니다.
- 수정 초안은 다음 cycle의 현재 초안으로 다시 들어가므로, 대화를 이어갈수록 결과물이 점점 다듬어집니다.
- 멈추고 싶을 때만 pause 입력창에서 `/done`을 입력하면 됩니다.

실행이 끝나면 다음 결과물을 열어볼 수 있습니다.

- `summary.md`
- `improvement-plan.md`
- `revised-draft.md`
- `notion-brief.md`
- `chat-messages.json`
- `events.ndjson`

이전 논의를 이어가고 싶다면 `Recent runs`에서 `Continue`를 누르면 됩니다.

- 새 provider 세션을 여는 방식이며, 이전 run 자체를 다시 여는 것은 아닙니다.
- 대신 이전 run의 `summary`, `improvement plan`, `revised draft`, `notion brief`, 최근 대화 일부를 새 run의 참고 맥락으로 자동 주입합니다.
- `Continue note`에 이번에 더 다듬고 싶은 방향을 적으면 새 run의 시작 컨텍스트에 함께 들어갑니다.

## 저장 구조

모든 데이터는 워크스페이스 안의 `.forjob/` 폴더에 저장됩니다.

- 공통 프로필 문서
- 프로젝트별 문서
- 실행별 로그
- 요약 결과
- 수정 초안
- 프로젝트별 인사이트 보조 JSON과 생성 문서

즉, 앱 내부에 숨겨진 형태가 아니라 사용자가 직접 열어보고 백업하거나 Git으로 관리할 수 있는 구조입니다.

다만 실제 사용 워크스페이스를 Git으로 관리한다면 `.forjob/`는 보통 `.gitignore`에 넣는 편이 안전합니다. 이 폴더에는 실행 로그, 초안, 요약 결과, 개인 지원 자료가 함께 들어갈 수 있습니다.

## 인증 및 보안

- 기본 경로는 `CLI login`입니다.
- `API key` 모드는 provider별 선택 기능입니다.
- API 키는 워크스페이스 파일에 저장되지 않고 VS Code `SecretStorage`에 저장됩니다.
- OpenDART API 키도 동일하게 VS Code `SecretStorage`에 저장됩니다.
- 루트에 `secretkey`, `.env`, `*.pem` 같은 임시 민감정보 파일을 두지 말고, 필요하면 로컬에서만 쓰는 무시 파일이나 VS Code `SecretStorage`를 사용하세요.
- `Notion request`를 쓰려면 coordinator로 선택한 CLI가 사용자 환경에서 이미 Notion MCP를 사용할 수 있어야 합니다.

## 파일 처리 방식

- `txt`, `md`, 직접 입력 텍스트는 바로 정규화해서 저장합니다.
- `pdf`는 `pdf-parse`를 우선 사용하고, 필요하면 `pdfjs-dist`로 대체 추출합니다.
- `pptx`는 슬라이드 텍스트를 추출해서 저장합니다.
- 이미지는 원본 파일과 메모만 저장하며, v1에서는 OCR을 하지 않습니다.

## 참고

- 최소 2개의 healthy provider가 있어야 멀티 모델 토론 실행이 가능합니다.
- 실행 결과는 항상 워크스페이스에 파일로 남습니다.
- 이 프로젝트는 개인용 로컬 도구를 전제로 하며, 웹 서비스 배포 구조는 포함하지 않습니다.
