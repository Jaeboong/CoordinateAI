# Insight Pre-Pass Design

## Goal

Add a project-scoped pre-writing insight layer to ForJob so users can analyze a posting and company before starting the existing essay drafting/review run.

## Scope

The v1 scope is artifact-first:

- collect posting URL and essay questions at the project level
- fetch and normalize posting content
- extract structured hiring fields
- require user review/correction before final generation
- enrich official company data via OpenDART REST
- generate reusable project-scoped markdown insight artifacts
- inject those artifacts into the existing run context automatically

The v1 does not try to replicate a full separate product surface. Insights will live inside the existing project/document model and reuse the current run context compiler.

## Chosen Approach

### 1. Extend the existing project metadata

The current project model already stores `companyName`, `roleName`, `mainResponsibilities`, and `qualifications`. We will extend this model to also remember:

- `jobPostingUrl`
- `essayQuestions`
- a reviewed extraction snapshot
- DART match metadata
- insight generation timestamps/status

This keeps project setup, review, and regeneration anchored to the existing project object rather than introducing a parallel insight store.

### 2. Store user-facing insights as normal project documents

The generated files:

- `company-insight.md`
- `job-insight.md`
- `application-strategy.md`
- `question-analysis.md`

will be persisted through the existing project document flow so they can be previewed, pinned, edited, and automatically included by the current context compiler.

Low-risk helper JSON files may also be stored under the project directory for caching/debugging, but the user-facing workflow will not depend on them.

### 3. Separate insight generation pre-pass

Insight generation will be a distinct action from the current run loop.

Flow:

1. user enters/updates project insight inputs
2. app fetches the posting and derives a structured extraction candidate
3. user reviews/corrects the structured fields
4. app resolves/enriches company info from OpenDART
5. app generates the four stable markdown artifacts
6. future essay runs absorb those artifacts automatically

This avoids mixing brittle fetch/extraction work into the live multi-agent discussion loop.

### 4. Official OpenDART REST only

The DART integration will use the official REST API directly, not unofficial MCP servers.

Required capabilities:

- corp code resolution with caching
- company overview fetch
- financial statement fetch
- graceful handling for no key / no match / ambiguous match / missing financial data / temporary failure

The OpenDART API key will be stored using VS Code `SecretStorage`, following the existing workspace secret pattern already used for provider API keys.

### 5. Required extraction review step

Posting extraction will not be trusted blindly. After automatic extraction, the user must be able to correct:

- company name
- role name
- main responsibilities
- qualifications
- preferred qualifications
- keywords / tech stack

If the URL fetch or extraction fails, the user must still be able to continue with manual paste/edit.

## Generation Strategy

The pre-pass should remain bounded and predictable.

V1 generation plan:

- deterministic source collection:
  - reviewed posting fields
  - normalized posting text excerpt
  - OpenDART company metadata and financial summaries
- provider-backed synthesis:
  - one bounded insight-generation prompt for company/job/application strategy
  - one bounded prompt for per-question analysis

The optional web/news layer is best-effort. The architecture will leave a slot for it, but missing optional enrichment must not block artifact generation.

## Data Boundaries

### Required source-backed sections

- company overview
- business segments
- financial summary
- role overview
- required/preferred qualifications
- keyword extraction
- question intent/evaluation/writing direction

### Optional sections

- recent issues
- competitors / positioning
- SWOT
- R&D / investment notes

Optional sections must only render when there is adequate source coverage. Otherwise the artifact must omit the section or explicitly note insufficient coverage.

## UX Shape

Projects will gain a lightweight insights subsection instead of a new large dashboard.

Expected v1 UX:

- project info form includes posting URL and essay questions
- dedicated actions:
  - analyze posting
  - save reviewed extraction
  - generate insights
  - regenerate insights
- reviewed extraction fields shown inline and editable
- generated insight docs appear in the existing project document area and are pinned by default

## Testing Strategy

Add deterministic tests for:

- posting HTML normalization/extraction
- extraction fallback/manual edit handling
- DART client parsing and cache behavior
- insight orchestration and artifact persistence
- automatic context inclusion
- webview/protocol/schema changes

No live network calls in tests. Use sanitized fixtures.

