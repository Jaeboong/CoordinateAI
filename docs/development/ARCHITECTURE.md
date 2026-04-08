# Development Harness Architecture

## Goal

Keep repository-level AI coding guidance, validation, and review controls separate from the shipped product runtime.

## The Two-Plane Model

This repository has two distinct planes that should not be conflated.

### 1. Product Plane

The product plane is the app that users run.

- `src/core/orchestrator.ts` coordinates essay-feedback runs.
- `src/core/providerStreaming.ts`, `src/core/notionMcp.ts`, and related provider files manage CLI/MCP interactions.
- `src/controller/` handles extension-host state and session flow.
- `src/webview/` renders the UI.
- `agents/` defines runtime role specs, prompts, and role documentation used by the product workflow.

Changes in this plane affect user-visible behavior and usually require stronger review, broader regression coverage, and careful handling of provider-dependent behavior.

### 2. Development-Harness Plane

The development-harness plane exists to make repository changes safer and easier for humans and AI coding agents.

- Root `AGENTS.md` is the concise control plane.
- `docs/development/` explains rules and operating boundaries.
- `docs/plans/` captures proposed work and execution plans.
- `tools/validate-*.ts` contains deterministic repository validators.
- `.github/` contains CODEOWNERS, PR templates, and deterministic CI workflows.

This plane should help contributors modify the repository without changing product logic unless the work explicitly requires it.

## Separation Rules

- Do not use `agents/` as the repository harness.
- Do not move or rename `agents/` to fit a harness convention.
- Runtime role contracts belong to the product plane.
- Repo-wide coding guidance, validation policy, and review scaffolding belong to the harness plane.

## Validation Layers

The harness uses layered validation.

### Deterministic Local/CI Checks

- TypeScript build
- `node:test` suites
- product agent spec contract validation
- documentation/link validation

These must remain credential-free and repeatable in CI.

### Live Smokes

Provider CLI login, Notion MCP connectivity, and end-to-end provider execution depend on credentials, local installations, or interactive setup.

These checks are useful, but they are not suitable as required PR gates unless they become deterministic and credential-free.

## Review Boundaries

### High-scrutiny product paths

- `agents/**`
- `src/core/orchestrator.ts`
- `src/core/providerStreaming.ts`
- `src/core/notionMcp.ts`
- `src/controller/runSessionManager.ts`
- `scripts/setup-providers.sh`

### Harness control paths

- `AGENTS.md`
- `docs/development/**`
- `tools/**`
- `.github/**`
- `package.json`

Harness changes are lower risk to runtime behavior, but they can still affect contributor workflow, validation expectations, and merge policy, so they need review as governance changes.

## Practical Workflow

1. Inspect the local repository state first.
2. Write or update a dated plan in [docs/plans/](../plans/).
3. Make minimal coherent changes.
4. Run deterministic validation.
5. Summarize what changed, what was validated, and what still needs human review.

## Source Code Architecture

This section documents the internal module structure established during the 2026-04 refactoring. Maintain these patterns when adding or extending source files.

### Controller Layer (`src/controller/`)

```
forJobController.ts          ← facade only (~120 lines)
controllerContext.ts          ← ControllerContext interface + MessageHandlerMap type
handlers/
  providerHandlers.ts         ← provider auth/model/effort/Notion-MCP handlers
  openDartHandlers.ts         ← OpenDART API key and connectivity handlers
  profileHandlers.ts          ← profile document import/upload/pin handlers
  projectHandlers.ts          ← project CRUD and document handlers
  insightHandlers.ts          ← insight analysis/generation/workspace handlers
  runHandlers.ts              ← run lifecycle handlers
```

**Pattern**: Each handler file exports `createXxxHandlers(ctx: ControllerContext): Partial<MessageHandlerMap>`.
`forJobController.ts` spreads all factories into a single handler map and contains no handler bodies.

`ControllerContext` is the shared service-locator interface. It exposes `storage()`, `registry()`, `orchestrator()`, `runBusy()`, `pushState()`, `refreshAll()`, and stable references to `sidebar`, `stateStore`, `runSessions`, `insightWorkspace`, `workspaceRoot`, `context`.

### Storage Layer (`src/core/`)

```
storageInterfaces.ts    ← narrow per-consumer interfaces (DIP contracts)
storage.ts              ← ForJobStorage facade (~350 lines, one-liner delegations)
storagePaths.ts         ← all filesystem path computation
manifestStore.ts        ← document manifest CRUD (saveTextDocument, importFile, importBuffer)
runRepository.ts        ← run lifecycle persistence (createRun, appendEvent, loadContinuation, …)
```

**Pattern**: `ForJobStorage` implements all four interfaces from `storageInterfaces.ts`. It holds instances of `StoragePaths`, `ManifestStore`, and `RunRepository` and delegates every non-trivial operation to them. Storage method bodies in `ForJobStorage` are single lines — logic lives in the delegates.

**Dependency inversion**: Consumers receive narrow interfaces, not `ForJobStorage` directly:

| Consumer | Interface |
|---|---|
| `contextCompiler.ts` | `DocumentContentReader` |
| `providers.ts` | `ProviderStore` |
| `orchestrator.ts` | `RunStore` |
| `sidebarStateStore.ts` | `StateStoreStorage` |

### Webview Layer (`src/webview/`)

```
sidebarScript.ts              ← assembler only (~25 lines)
sidebarState.ts               ← stateSource (state management)
sidebarMessages.ts            ← messageHandlingSource (message dispatch)
sidebarMarkdown.ts            ← markdownSource (markdown rendering)
sidebarRender.ts              ← renderSource (shared render helpers)
sidebarPageRenderers.ts       ← pageRendererSource (per-page render functions)
sidebarDomEvents.ts           ← domEventSource (DOM event bindings)
```

**Pattern**: Each section file exports one `*Source: string` constant containing `String.raw\`...\`` template literal inline JS. `sidebarScript.ts` joins them in order and passes through `materializeInlineScript` to unescape backtick sequences.

### Interfaces and Type Contracts

- Zod schemas in `src/core/schemas.ts` are the single source of truth for runtime validation.
- `src/core/types.ts` derives TypeScript types from schemas via `z.infer`.
- `src/core/webviewProtocol.ts` defines all message types exchanged between extension host and webview.
- `src/core/viewModels.ts` defines the view-model shape pushed to the webview via `pushState`.

### Adding New Functionality

| What you're adding | Where it goes |
|---|---|
| New message handler | New or existing file in `src/controller/handlers/` |
| New storage operation | Appropriate delegate (`ManifestStore`, `RunRepository`), then one-liner in `ForJobStorage` |
| New storage consumer | Accept a narrow interface from `storageInterfaces.ts` or extend that file |
| New webview UI section | New section file in `src/webview/`, add to assembler join array |
| New path computation | `StoragePaths` method |
| New message type | `webviewProtocol.ts` (and `viewModels.ts` if it's a state shape) |

## Related Documents

- [Repository control plane](../../AGENTS.md)
- [Operating rules](OPERATING_RULES.md)
- [Coding conventions](CODING_CONVENTIONS.md)
- [Failure taxonomy](../runbooks/failure-taxonomy.md)
