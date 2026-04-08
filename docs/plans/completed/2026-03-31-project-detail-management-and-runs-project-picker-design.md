# Project Detail Management And Runs Project Picker Design

## Goal
`Projects` 탭을 진짜 프로젝트 관리 화면으로 바꾸고, `Runs` 탭에서도 어떤 프로젝트를 기반으로 세션을 돌릴지 직접 고를 수 있게 만든다.

## UX Direction
- `Projects`
  - 상단에 새 프로젝트 생성
  - 프로젝트 선택 영역 분리
  - 선택된 프로젝트의 상세 영역에서 아래를 관리
    - 프로젝트 정보 수정
    - 프로젝트 삭제
    - rubric 수정
    - 프로젝트 컨텍스트 문서 추가
    - 프로젝트 문서 수정 / 삭제 / pin
- `Runs`
  - 탭 안에서 프로젝트를 직접 선택
  - 선택 프로젝트가 바뀌면 해당 프로젝트의 extra documents / recent runs / heading 이 함께 바뀜

## Project Detail Rules
- 프로젝트 slug는 저장 경로 안정성을 위해 생성 후 유지한다.
- 회사명과 역할명은 수정 가능하다.
- 프로젝트 삭제 시 `.forjob/projects/<slug>` 전체를 삭제한다.
- 삭제 전에는 확인 단계를 거친다.

## Document Editing Rules
- 텍스트 계열 문서(`text`, `txt`, `md`)는 title / note / pin / content 수정 가능
- 비텍스트 문서(`pdf`, `pptx`, `image`, `other`)는 title / note / pin 수정과 삭제만 지원
- 문서 삭제 시 manifest 항목과 raw/normalized 파일을 함께 정리한다.

## Runs Behavior
- `selectedProjectSlug`는 여전히 화면 공통 선택 상태로 유지한다.
- 다만 `Runs` 탭에서 드롭다운으로 바로 바꿀 수 있게 한다.
- `Continue`로 들어온 경우에는 해당 run의 프로젝트를 우선 선택한다.

## Testing
- storage
  - 프로젝트 정보 수정
  - 프로젝트 삭제
  - 프로젝트 문서 수정
  - 프로젝트 문서 삭제
- web/controller
  - Runs에서 프로젝트 선택이 바뀌어도 제출 payload가 올바른 project slug를 사용
  - 문서 편집 프리셋 로드와 저장이 정상 동작
