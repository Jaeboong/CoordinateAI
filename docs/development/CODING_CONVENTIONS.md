# Coding Conventions

These conventions encode the patterns established during the 2026-04 SRP/DIP refactoring. Apply them consistently when adding or modifying source files.

## Single Responsibility Principle

Each file has one reason to change.

- A handler file changes when the behavior of that handler group changes.
- A delegate class (`ManifestStore`, `RunRepository`, `StoragePaths`) changes when its specific concern changes.
- A facade/assembler changes only when the wiring between modules changes.
- A webview section file changes when that section's UI logic changes.

When a file has two or more unrelated reasons to change, split it.

## Dependency Inversion Pattern

Consumers depend on interfaces, not concrete classes.

### Defining an interface

Add it to `src/core/storageInterfaces.ts`. Use the narrowest surface that satisfies the consumer:

```typescript
export interface DocumentContentReader {
  readDocumentNormalizedContent(document: ContextDocument): Promise<string | undefined>;
}
```

### Consuming an interface

Import and accept the interface, not `ForJobStorage`:

```typescript
// good
import type { DocumentContentReader } from "./storageInterfaces";
export class ContextCompiler {
  constructor(private readonly storage: DocumentContentReader) {}
}

// bad
import { ForJobStorage } from "./storage";
export class ContextCompiler {
  constructor(private readonly storage: ForJobStorage) {}
}
```

### Implementing an interface

`ForJobStorage` declares `implements` for all interfaces it satisfies. TypeScript enforces the contract at compile time:

```typescript
export class ForJobStorage implements ProviderStore, DocumentContentReader, StateStoreStorage, RunStore {
  ...
}
```

When a new storage interface is added, add the `implements` clause to `ForJobStorage`.

## Handler Module Pattern

Every VS Code message handler lives in `src/controller/handlers/`.

### File structure

```typescript
import type { ControllerContext } from "../controllerContext";
import type { MessageHandlerMap } from "../controllerContext";

export function createXxxHandlers(ctx: ControllerContext): Partial<MessageHandlerMap> {
  return {
    someMessage: async (message) => {
      const storage = ctx.storage();
      // ...
      await ctx.pushState();
    },

    anotherMessage: async (message) => {
      await ctx.runBusy("Working…", async () => {
        // ...
      });
    },
  };
}
```

### Controller assembly

`forJobController.ts` assembles all handlers with object spread:

```typescript
private readonly handlers: MessageHandlerMap = {
  ...createProviderHandlers(this),
  ...createOpenDartHandlers(this),
  ...createProfileHandlers(this),
  ...createProjectHandlers(this),
  ...createInsightHandlers(this),
  ...createRunHandlers(this),
};
```

No handler body belongs in `forJobController.ts`.

### Sharing helpers between handler files

If a helper is needed by multiple handler files, export it from the file that owns it and import it in consumers:

```typescript
// profileHandlers.ts
export async function pickAndImportFiles(ctx: ControllerContext, scope: "profile" | "project", projectSlug?: string): Promise<void> { ... }

// projectHandlers.ts
import { pickAndImportFiles } from "./profileHandlers";
```

## Storage Delegation Pattern

`ForJobStorage` is a facade. Every method is a one-liner:

```typescript
// good — delegates to the responsible class
async listRuns(projectSlug: string): Promise<RunRecord[]> {
  return this.runs.listRuns(projectSlug);
}

// bad — contains logic in the facade
async listRuns(projectSlug: string): Promise<RunRecord[]> {
  const entries = await fs.readdir(...);
  // ... 20 lines of logic
}
```

Logic placement:

| Concern | Delegate |
|---|---|
| Filesystem path computation | `StoragePaths` |
| Document manifest CRUD | `ManifestStore` |
| Run lifecycle persistence | `RunRepository` |
| Project/profile CRUD, preferences, provider status | `ForJobStorage` (own methods) |

## Webview Inline Script Pattern

The webview inline script is built from section constants, not maintained as a monolith.

### Section file template

```typescript
export const xyzSource = String.raw`
  // inline JS here — use \` for literal backticks, \${ for literal template expressions
`;
```

### Assembler

`sidebarScript.ts` only imports and joins:

```typescript
import { xyzSource } from "./sidebarXyz";

export function buildSidebarScript(): string {
  return materializeInlineScript([
    ...,
    xyzSource,
    bootSource,
  ].join("\n"));
}
```

The assembler contains no inline JS content.

## Schema and Type Conventions

- Define Zod schemas in `src/core/schemas.ts`.
- Derive TypeScript types with `z.infer<typeof XxxSchema>` in `src/core/types.ts`.
- Do not write manual TypeScript interfaces for persisted data — use `z.infer`.
- Always call `.parse()` when reading data from disk to get runtime validation.

## Adding a New Feature Checklist

1. **New message type**: add to `src/core/webviewProtocol.ts`.
2. **New view-model field**: add to `src/core/viewModels.ts`.
3. **New handler**: add to an existing handler file or create `src/controller/handlers/xxxHandlers.ts`, spread it in `forJobController.ts`.
4. **New storage operation**: implement in the appropriate delegate, add a one-liner delegation in `ForJobStorage`, extend the relevant interface in `storageInterfaces.ts` if external consumers need it.
5. **New webview section**: create `src/webview/sidebarXxx.ts`, add to `sidebarScript.ts` assembler.
6. **New path**: add a method to `StoragePaths`.
7. **Run `tsc --noEmit`** after each step, not just at the end.

## Related Documents

- [Repository control plane](../../AGENTS.md)
- [Architecture overview](ARCHITECTURE.md)
- [Operating rules](OPERATING_RULES.md)
