# VSIX Harness Design

## Goal

ForJob 개발자가 로컬 저장소 변경 사항을 `VSIX 패키징 -> WSL VS Code 서버 설치 -> 버전 검증` 흐름으로 일관되게 재적용할 수 있도록, 저장소 수준의 표준 하네스 명령을 제공한다.

## Chosen Approach

원시 `rsync` 기반 덮어쓰기를 공식 절차로 남기지 않고, VS Code 확장 배포 형식에 맞는 `VSIX` 패키징을 기준으로 재적용한다. 저장소는 `build`, `test`, `package`, `install`, `verify`를 분리한 스크립트를 제공하고, 개발자가 평소에는 `deploy:wsl-extension` 한 번으로 전체 흐름을 실행하도록 한다.

## Why This Approach

- 설치된 확장 폴더 내부 레이아웃 변화에 덜 취약하다.
- 실제 배포 형식과 더 가깝기 때문에 “로컬에서는 되는데 설치본은 다르다”는 문제를 줄인다.
- 버전이 올라간 새 확장 디렉터리를 자연스럽게 만들 수 있어, 설치 상태를 확인하기 쉽다.

## Scope

- `package.json`에 하네스 명령 추가
- `scripts/`에 VSIX 패키징 / WSL 설치 / 검증 스크립트 추가
- 저장소 내부 스크립트로 `.vsix` 산출물 생성
- README와 개발 문서에 재적용 방법 명시

## Non-Goals

- Windows 로컬 VS Code 설치 흐름 자동화
- extension host 강제 재시작 자동화
- 릴리스용 signing/publishing 파이프라인

## UX

개발자는 다음 명령만 기억하면 된다.

- `./scripts/package-vsix.sh`
- `./scripts/install-wsl-extension.sh`
- `./scripts/verify-wsl-extension.sh`
- `./scripts/deploy-wsl-extension.sh`

설치가 끝나면 VS Code에서는 `Developer: Reload Window`만 하면 된다.
