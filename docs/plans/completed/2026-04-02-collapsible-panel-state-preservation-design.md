# Collapsible Panel State Preservation Design

## Goal

`Runs`와 `Projects` 탭에서 설정/문서 추가, 수정, 삭제 이후에도 사용자가 열어 둔 섹션과 현재 스크롤 위치가 유지되도록 만든다. 실제로 접힘/펼침이 일어나는 경우에는 짧은 애니메이션을 넣어 UI 변화를 즉시 인지할 수 있게 한다.

## Root Cause

- `Projects` 탭의 `평가 기준`, `프로젝트 컨텍스트` 섹션은 렌더링할 때마다 기본 `open` 상태로 다시 만들어진다.
- `Runs`와 `Projects`는 상호작용 후 `content.innerHTML` 전체를 다시 그리기 때문에 문서 스크롤 위치가 쉽게 초기화된다.
- 현재 접힘 UI는 `details` 기본 동작과 화살표 회전만 사용해 본문이 즉시 사라지므로, 접힘이 발생했는지 시각적으로 충분히 드러나지 않는다.

## Approach

- 웹뷰 persisted state에 접힘 상태와 탭별 스크롤 위치를 저장한다.
- `Runs`의 실행 설정 카드와 `Projects`의 접힘 섹션을 커스텀 collapsible markup으로 바꿔 open/closed 상태를 명시적으로 렌더링한다.
- 본문은 `grid-template-rows`, `opacity`, `transform`, `padding` 전환을 사용해 160ms 안팎의 빠른 애니메이션으로 접히고 펴지게 만든다.
- 렌더 전 현재 탭 스크롤 값을 기록하고 렌더 직후 같은 탭의 스크롤을 복원해 “접혀 보이거나 위로 튀는” 체감을 없앤다.

## Scope

- `Runs`: `실행 설정`
- `Projects`: `새 프로젝트`, `평가 기준`, `프로젝트 컨텍스트`
- 회귀 방지용 스모크 테스트 추가

## Non-Goals

- 채팅 로그 내부 스크롤 동작 변경
- 시스템 스트림 `details` 동작 변경
- 데이터 저장 포맷 변경
