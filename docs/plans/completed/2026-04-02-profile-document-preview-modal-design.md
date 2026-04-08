# Profile Document Preview Modal Design

## Summary

현재 `프로필 문서` 목록은 제목, 형식, 메모, 저장 경로만 보여주고 실제 내용을 볼 수 없다. 이 변경에서는 문서 항목을 클릭했을 때 웹뷰 내부 모달을 열어, 프로필 문서의 메타데이터와 본문 미리보기를 확인할 수 있게 한다.

## Goals

- `프로필 문서` 항목을 눌렀을 때 세부 내용을 볼 수 있게 한다.
- 문서 목록 화면을 벗어나지 않고 웹뷰 내부 모달로 빠르게 닫고 다시 탐색할 수 있게 한다.
- 텍스트 문서와 추출된 문서(PDF/PPTX 등)는 normalized 내용을 우선 보여준다.
- 추출된 텍스트가 없는 문서도 메타 정보는 확인할 수 있게 한다.

## Non-goals

- 프로젝트 문서 미리보기까지 이번 변경에 포함하지 않는다.
- 문서 내용을 모달 안에서 편집하지 않는다.
- 전체 파일 오픈/다운로드 같은 추가 액션은 넣지 않는다.

## Chosen Approach

웹뷰 내부 모달 방식을 사용한다.

- 문서 항목의 본문 영역은 버튼처럼 동작하게 만든다.
- 우측의 기본 포함 체크박스는 기존 동작을 유지하고, 모달 오픈과 분리한다.
- 확장 호스트가 문서 내용을 읽어 `profileDocumentPreview` 메시지로 웹뷰에 전달한다.
- 웹뷰는 별도 local state로 현재 열린 preview를 보관하고 모달을 렌더한다.

## Data Flow

1. 사용자가 `프로필 문서` 목록의 항목 본문을 클릭한다.
2. 웹뷰가 `openProfileDocumentPreview` 메시지를 확장으로 보낸다.
3. 컨트롤러가 storage에서 해당 profile document를 찾고, `normalizedPath` -> `rawPath` 순으로 미리보기 문자열을 구성한다.
4. 사이드바 provider가 `profileDocumentPreview` 메시지를 웹뷰로 보낸다.
5. 웹뷰는 preview payload를 저장하고 모달을 연다.
6. 사용자가 닫기 버튼, 배경 클릭, `Esc` 중 하나로 모달을 닫는다.

## Preview Content Rules

- `normalizedPath`가 있으면 normalized content를 우선 사용한다.
- normalized content가 없고 텍스트 계열(`text`, `txt`, `md`)이면 raw content를 fallback으로 사용한다.
- 둘 다 없으면 “미리보기 가능한 텍스트가 없습니다.” 안내를 표시한다.
- 메타 정보로는 제목, source type, extraction status, 메모, raw path, normalized path 유무를 보여준다.

## UI Details

- 문서 목록의 각 항목에 `내용 보기` affordance가 드러나도록 hover/cursor 스타일을 준다.
- 모달은 화면 전체 backdrop 위에 중앙 정렬된 패널로 띄운다.
- 긴 내용은 모달 내부에서만 스크롤되도록 한다.
- 코드/마크다운처럼 보이는 텍스트는 `<pre>` 기반으로 공백과 줄바꿈을 보존한다.

## Error Handling

- 문서를 찾지 못하면 배너 에러를 띄우고 모달은 열지 않는다.
- 읽기 중 예외가 나면 에러 배너를 띄운다.
- 모달은 기존 sidebar state와 독립적으로 동작해 다른 탭 상태를 건드리지 않는다.

## Testing

- 프로토콜 스키마에 새 request/response 메시지 타입을 추가하고 테스트한다.
- storage 기반 preview 로딩 로직을 테스트한다.
- sidebar script가 새 preview 메시지를 받아도 parse 가능하고 모달 상태를 보존하는지 스모크 테스트한다.
