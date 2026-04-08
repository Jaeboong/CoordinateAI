# Job Fetch Diagnostics Implementation Plan

**Goal:** 공고 URL fetch 실패 시 응답 헤더와 짧은 본문 스니펫을 남겨 원인을 정확히 진단할 수 있게 한다.

**Architecture:** 기존 공고 추출 흐름은 유지하고, `src/core/jobPosting.ts`에서 비정상 응답을 구조화된 진단 정보와 함께 감싼다. 인사이트 핸들러는 그 진단 정보를 프로젝트 인사이트 JSON과 출력 채널에 기록하고, 사용자 배너는 기존처럼 짧게 유지한다.

**Tech Stack:** TypeScript, VS Code extension host logging, project insight JSON persistence, `node:test`

**Status:** In Progress

---

### Task 1: HTTP Failure Diagnostics

**Files:**
- Modify: `src/core/jobPosting.ts`
- Modify: `src/controller/handlers/insightHandlers.ts`
- Modify: `src/controller/controllerContext.ts`
- Modify: `src/controller/forJobController.ts`
- Test: `src/test/jobPosting.test.ts`

**Step 1:** 비정상 응답에서 상태코드, 최종 URL, 응답 헤더, 짧은 본문 스니펫을 담는 구조화된 진단 타입을 추가한다.

**Step 2:** 인사이트 핸들러에서 해당 진단 정보를 `job-fetch-error.json`으로 저장하고 `ForJob` 출력 채널에도 기록한다.

**Step 3:** 실패 메시지는 계속 짧게 유지하되, 진단 로그로 원인을 확인할 수 있도록 세부 정보는 로그/JSON에만 남긴다.

**Step 4:** mocked fetch 기반 테스트로 헤더/본문 스니펫/민감 헤더 마스킹을 검증한다.

### Notes

- Risks: 일부 사이트는 HTML 에러 페이지를 매우 크게 반환하므로 본문 저장량을 제한해야 한다.
- Follow-up: 원인이 확인되면 브라우저형 fetch 또는 사이트별 fallback 전략을 별도 작업으로 진행한다.
- Validation run:
