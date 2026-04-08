# Repository AGENTS Guide

This repository contains the `ForJob` VS Code extension for orchestrating multi-provider essay feedback workflows.

## Important Boundary

- `agents/` is product runtime content.
- Files under `agents/` define roles, prompts, and contracts used by the shipped essay-feedback workflow.
- `agents/` is not the repository-level development harness.
- Put repository-level guidance in this file, `docs/development/`, `docs/runbooks/`, and `.github/`.

## Repo Map

- `src/`: extension source code
- `src/core/`: orchestration, provider adapters, storage, schemas
  - `src/core/storageInterfaces.ts`: narrow per-consumer interfaces (`ProviderStore`, `DocumentContentReader`, `StateStoreStorage`, `RunStore`)
  - `src/core/storage.ts`: `ForJobStorage` facade — delegates to `StoragePaths`, `ManifestStore`, `RunRepository`
  - `src/core/storagePaths.ts`: all filesystem path computation
  - `src/core/manifestStore.ts`: document manifest CRUD
  - `src/core/runRepository.ts`: run lifecycle persistence
- `src/controller/`: extension host controllers and run/session management
  - `src/controller/controllerContext.ts`: `ControllerContext` interface shared by all handler modules
  - `src/controller/handlers/`: one file per handler group (providerHandlers, openDartHandlers, profileHandlers, projectHandlers, insightHandlers, runHandlers)
- `src/webview/`: sidebar UI script, template, and styles
  - `src/webview/sidebarScript.ts`: thin assembler (~25 lines); imports section files
  - Section files: `sidebarState.ts`, `sidebarMessages.ts`, `sidebarMarkdown.ts`, `sidebarRender.ts`, `sidebarPageRenderers.ts`, `sidebarDomEvents.ts`
- `src/test/`: deterministic node:test coverage
- `agents/`: product runtime role specs and docs
- `tools/`: repository-level deterministic validators
- `docs/development/`: harness architecture and operating policy
- `docs/plans/`: dated design/implementation plans
- `.github/`: review templates, CODEOWNERS, CI workflows

## Standard Local Commands

- `npm run build`
- `npm run test`
- `npm run agent-contracts`
- `npm run agent-docs`
- `npm run agent-check`
- `npm run smoke:local`
- `npm run smoke:live`

## Code Quality Invariants

These invariants encode the architecture established during the 2026-04 refactoring. Preserve them on every change.

### File Size

- Focused modules (classes, handler groups, webview sections): target ≤ 300 lines.
- Facade/assembler files (e.g. `storage.ts`, `sidebarScript.ts`, `forJobController.ts`): target ≤ 150 lines.
- If a file grows past these thresholds, split it before merging — do not just note it for later.

### Controller Handlers

- **Do not add handlers directly in `forJobController.ts`.**
- Place new handlers in an existing file under `src/controller/handlers/`, or create a new one.
- Every handler file exports a `createXxxHandlers(ctx: ControllerContext): Partial<MessageHandlerMap>` factory.
- `forJobController.ts` assembles the map with object spread; it contains no handler bodies.

### Storage

- **Do not add methods directly to `ForJobStorage` that implement logic.**
- Path computation → `StoragePaths`.
- Document manifest operations → `ManifestStore`.
- Run lifecycle operations → `RunRepository`.
- `ForJobStorage` methods are one-liner delegations; keep it a facade.

### Dependency Inversion

- Consumers (`contextCompiler.ts`, `providers.ts`, `orchestrator.ts`, `sidebarStateStore.ts`) depend on the narrow interfaces in `storageInterfaces.ts`, not on `ForJobStorage` directly.
- When adding a new consumer of storage, accept the narrowest interface that satisfies the need.
- When adding new storage methods, add the corresponding method to the appropriate interface if external consumers need it.

### Webview Inline Script

- The inline JS is split into section files under `src/webview/`. Each file exports one `*Source` constant.
- `sidebarScript.ts` is the assembler only — do not add logic there.
- New UI sections go in a new section file and are added to the assembler's join array.

## High-Risk Paths

- `agents/**`
- `src/core/orchestrator.ts`
- `src/core/providerStreaming.ts`
- `src/core/notionMcp.ts`
- `src/controller/runSessionManager.ts`
- `scripts/setup-providers.sh`
- `package.json`
- `README.md`
- `.github/**`

Changes in these paths need stronger validation and usually human review.

## Planning Rules For Multi-Step Work

- Inspect the local tree before editing.
- Create or update a dated plan file in `docs/plans/` before broad changes.
- Keep plans small, explicit, and easy to resume.
- Prefer additive harness changes outside the product runtime.
- If work touches high-risk paths, record why and what extra validation was run.

## Definition Of Done

- Code and docs match the local repository state.
- Deterministic checks pass locally when available.
- New scripts are documented and wired into the repo entry points.
- No secrets, `.forjob/` user data, or unsanitized personal artifacts are added.
- Any unvalidated live-provider behavior is called out explicitly.

## PR Evidence Required

Before opening a PR, provide:

- summary of changed behavior and why
- file list grouped by purpose
- exact commands run and pass/fail results
- note of any skipped validation and why it was skipped
- explicit callout if high-risk paths were touched
- confirmation that no real secrets or personal applicant data were committed

## Deep Dives

- [Architecture and plane separation](docs/development/ARCHITECTURE.md)
- [Operating policy and review gates](docs/development/OPERATING_RULES.md)
- [Coding conventions and patterns](docs/development/CODING_CONVENTIONS.md)
- [Failure handling guidance](docs/runbooks/failure-taxonomy.md)
- [Planning template](docs/plans/TEMPLATE.md)
