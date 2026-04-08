# Agent Prompt: Implement Deeper Company Analysis

Use the local repository state in `/home/cbkjh0225/project/forJob` as the source of truth.

Read these documents first:

- [AGENTS.md](/home/cbkjh0225/project/forJob/AGENTS.md)
- [2026-04-07-company-analysis-depth-design.md](/home/cbkjh0225/project/forJob/docs/plans/2026-04-07-company-analysis-depth-design.md)
- [2026-04-07-insight-prepass-design.md](/home/cbkjh0225/project/forJob/docs/plans/2026-04-07-insight-prepass-design.md)

## Mission

Improve ForJob's `company-insight.md` so it behaves like a true company analysis artifact, not just a posting-aware company memo.

## Product Goal

When a user generates insights for a project, the company analysis should:

- explain how the company makes money
- describe the real business structure and key offerings
- summarize recent growth direction and meaningful change
- connect the company context back to the target role
- give the user 3 or more concrete company angles they can use in essays and interviews

## Scope Requirements

Implement the smallest real version that closes the current quality gap.

Required:

1. Add a `company source bundle` stage before insight generation
2. Use official sources first:
   - OpenDART
   - company official homepage / company intro / business intro pages when available
   - official hiring page
   - official IR / press / tech blog only when clearly discoverable and low risk
3. Persist machine-readable source artifacts under the existing project insight storage
4. Generate `company-insight.md` from a dedicated company-analysis prompt or pre-pass, not just the single shared 4-file prompt
5. Reshape `company-insight.md` to follow the sections from the design doc
6. Show source coverage in the insight workspace company tab
7. Keep failure graceful:
   - homepage fetch failure must not block insight generation
   - weak coverage must be surfaced explicitly, not fabricated away

Optional if low risk:

- limited external article enrichment
- recent issues / competitors / positioning when source support is strong

## Constraints

- Do not depend on unofficial DART MCP
- Keep artifact-first architecture
- Reuse existing project storage and insight workspace where practical
- Prefer deterministic fixtures and mocks over live network tests
- Do not broaden this into a full dashboard redesign

## Recommended Implementation Outline

1. Inspect current insight pipeline:
   - `src/core/insights.ts`
   - `src/core/openDart.ts`
   - `src/controller/handlers/insightHandlers.ts`
   - `src/webview/insightWorkspace*`

2. Add a company-source collector layer, likely in a new core module
   - collect source manifest entries
   - extract concise snippets
   - store source artifacts under project `insights/`

3. Add a company-profile synthesis step
   - turn raw source bundle into structured company-profile JSON
   - enforce coverage-aware notes

4. Split `company-insight.md` generation from the existing four-file pass
   - either generate company insight first and feed it into the remaining prompt
   - or introduce a separate dedicated generator for company analysis

5. Update insight workspace company tab
   - show coverage summary
   - show collected source types / freshness / omissions

6. Add deterministic tests
   - source collection
   - parsing/snippet extraction
   - orchestration
   - graceful fallback
   - source coverage rendering

## Deliverables

When done, report:

1. What changed
2. Which files changed
3. What source types were added
4. How `company-insight.md` output structure changed
5. What tests were added and run
6. What is intentionally deferred

## Quality Bar

The final result should make EchoMarketing-style output clearly stronger in:

- business structure explanation
- company-level story, not just job-level story
- role relevance to company direction
- essay-ready company talking points

without inventing unsupported facts.
