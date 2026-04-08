# Dynamic Provider Model Discovery Design

## Summary

AI 모델 탭의 모델 드롭다운이 정적인 하드코딩 목록만 보여주고 있어서, Claude 계열은 `sonnet`처럼 alias만 보이고 실제 고정 버전이 드러나지 않는다. 이 변경에서는 설치된 CLI에서 조회 가능한 경우 명시적 모델 ID를 동적으로 수집해 드롭다운에 노출하고, 조회가 실패하면 기존 하드코딩 목록으로 안전하게 폴백한다.

## Goals

- Claude 모델 선택 UI에서 `Sonnet 4.6` 수준까지 버전이 드러나도록 한다.
- 가능하면 alias 대신 고정 모델 ID를 저장해서 이후 호출 버전이 예기치 않게 바뀌지 않게 한다.
- Gemini도 설치된 CLI 정보가 있으면 정적인 목록보다 더 최신의 명시적 모델 목록을 노출한다.
- Codex는 현재도 버전이 명시된 목록이므로 기존 curated 목록을 유지한다.

## Non-goals

- 원격 API를 호출해서 실시간 모델 카탈로그를 받아오지는 않는다.
- 제공자별 모든 내부/실험용 모델을 완전하게 노출하지는 않는다.
- 기존 설정 마이그레이션을 강제로 수행하지는 않는다. 이미 저장된 alias 값은 그대로 동작하게 둔다.

## Approach Options

### 1. Static relabeling

하드코딩 목록의 라벨만 `sonnet` -> `Sonnet 4.6`처럼 바꾸는 방식이다. 구현은 가장 단순하지만 실제 실행 값은 여전히 alias라서 추후 alias 대상이 바뀌면 UI와 실행 의미가 어긋날 수 있다.

### 2. Hybrid local discovery with fallback

설치된 CLI 내부에서 모델 문자열을 파싱해 명시적 모델 ID 목록을 구성하고, 실패하면 현재 curated 목록으로 돌아간다. 실행 값도 동적으로 찾은 고정 모델 ID를 사용하게 만들 수 있어 가장 균형이 좋다.

### 3. Full external catalog sync

벤더 문서나 API에서 모델 카탈로그를 가져와 반영하는 방식이다. 가장 풍부하지만 네트워크 의존성이 생기고 인증/파싱/캐싱 비용이 현재 제품 범위에 비해 과하다.

## Chosen Design

2번 하이브리드 접근을 사용한다.

- `providerOptions`는 정적 fallback 정의를 계속 유지한다.
- 새로운 동적 조회 로직이 Claude와 Gemini의 설치된 CLI 또는 설치 패키지에서 명시적 모델 목록을 추출한다.
- 추출된 목록은 fallback 목록 위에 덮어쓰되, `기본값`과 `직접 입력...` 옵션은 유지한다.
- UI에는 사람이 읽기 쉬운 라벨을 표시한다.
  - 예: `claude-sonnet-4-6` -> `Sonnet 4.6`
  - 예: `claude-opus-4-6` -> `Opus 4.6`
  - Gemini는 값 자체가 충분히 설명적이므로 우선 원본 ID를 라벨로 사용한다.
- 런타임 상태 생성 시 비동기적으로 capabilities를 계산하도록 바꿔 웹뷰가 최신 모델 목록을 받게 한다.

## Data Flow

1. `ProviderRegistry.buildRuntimeState()`가 제공자별 command 경로를 확인한다.
2. `providerOptions`의 새 discovery 함수가 provider ID와 command를 받아 동적 모델 목록을 시도한다.
3. 성공 시 정규화된 옵션 목록을 `ProviderRuntimeState.capabilities.modelOptions`에 넣고, 실패 시 기존 정적 목록을 사용한다.
4. 웹뷰는 기존처럼 runtime state의 `provider.capabilities.modelOptions`를 렌더링한다.
5. 사용자가 동적으로 발견된 명시적 모델을 선택하면 workspace 설정에 그 값이 그대로 저장되고 이후 실행 인자에도 동일하게 전달된다.

## Provider-specific Discovery

### Claude

- `claude` 실행 파일 또는 연결된 배포 바이너리의 문자열에서 `claude-sonnet-*`, `claude-opus-*` 패턴을 수집한다.
- `4.6`, `4.5`처럼 버전 숫자를 파싱해서 최신순 정렬한다.
- alias 전용 문자열(`sonnet`, `opus`)만 찾은 경우는 동적 목록으로 간주하지 않고 fallback을 사용한다.

### Gemini

- 설치된 `@google/gemini-cli-core`의 `dist/src/config/models.js`에서 exported model constant 값을 읽어 모델 ID를 수집한다.
- `customtools` 같은 내부 전용 값은 제외해 드롭다운을 깔끔하게 유지한다.
- `auto`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-flash-preview` 같은 값은 explicit 옵션으로 노출한다.

### Codex

- 현재 curated 목록이 이미 explicit 버전 위주이므로 discovery를 추가하지 않는다.

## Error Handling

- CLI가 설치되지 않았거나 파일을 읽지 못하면 예외를 삼키고 fallback capabilities를 사용한다.
- discovery 실패는 provider 설치/인증 상태를 깨지 않는다.
- 기존 설정 값이 현재 dropdown 목록에 없더라도 custom input 경로를 통해 계속 표시/저장 가능하게 유지한다.

## Testing

- Claude 문자열 파싱 단위 테스트를 추가한다.
- Gemini config 파일 파싱 단위 테스트를 추가한다.
- `getProviderCapabilities` fallback과 custom model 판정이 동적 explicit 모델에 대해서도 맞게 동작하도록 테스트한다.
- `ProviderRegistry`가 비동기 capabilities를 담아 runtime state를 만드는지 검증한다.

## Risks

- CLI 내부 문자열 형식이 바뀌면 discovery가 실패할 수 있다.
  - 대응: fallback 목록 유지.
- 지나치게 많은 모델이 잡히면 UI가 지저분해질 수 있다.
  - 대응: 패턴 필터링과 정렬, 내부 전용 값 제외.
- 저장된 alias와 새 explicit 값이 혼재할 수 있다.
  - 대응: 둘 다 유효한 모델 문자열로 그대로 실행 가능하게 유지한다.
