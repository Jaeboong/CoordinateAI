# GreetingHR Structured Parsing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** GreetingHR 채용 공고에서 `__NEXT_DATA__` 구조화 데이터를 우선 활용해 직무/자격요건 추출 정확도를 높인다.

**Architecture:** 공고 fetch 성공 후 원본 HTML을 평평하게 긁기 전에 `__NEXT_DATA__` 안의 `getOpeningById` payload를 먼저 본다. GreetingHR 구조화 데이터가 있으면 `openingsInfo.detail`을 파싱 소스로 사용하고, 반복되는 `지원 분야`/`공통 자격` 구조를 role-aware heuristic으로 병합한다.

**Tech Stack:** TypeScript, Node fetch/HTML parsing via regex + JSON parse, `node:test`

**Status:** In Progress

---

### Task 1: GreetingHR source-aware parsing

**Files:**
- Modify: `src/core/jobPosting.ts`
- Test: `src/test/jobPosting.test.ts`

**Step 1:** `__NEXT_DATA__`에서 GreetingHR `getOpeningById` payload를 읽는 helper를 추가한다.

**Step 2:** 구조화 데이터가 있으면 `openingsInfo.detail` HTML을 우선 normalized text 소스로 사용한다.

**Step 3:** `■ 주요 업무`, `✈️ 우대 사항(공통)`, `지원 분야 2. Java`, `지원 자격(공통)` 같은 heading 변형을 읽도록 section matching을 보강한다.

**Step 4:** role 힌트가 있으면 반복되는 `지원 분야` 블록 중 해당 role과 맞는 자격요건을 우선 선택하고, 공통 자격/우대사항은 함께 병합한다.

### Task 2: Regression coverage

**Files:**
- Test: `src/test/jobPosting.test.ts`

**Step 1:** GreetingHR `__NEXT_DATA__` 기반 fixture HTML 테스트를 추가한다.

**Step 2:** Java/Python 반복 섹션 중 Java를 선택하는지 검증한다.

**Step 3:** heading 장식 문자와 `(공통)` suffix가 있어도 섹션을 찾는지 검증한다.

### Notes

- Risks: site-specific parsing이 너무 넓어지지 않도록 GreetingHR detection은 embedded payload가 있을 때만 작동시킨다.
- Follow-up: 다른 채용 사이트도 같은 방식으로 `structured source -> generic fallback` 계층을 확장할 수 있다.
- Validation run:
