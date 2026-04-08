# ForJob Maintainability Refactor Implementation Plan

**Goal:** Improve maintainability, safety, and responsiveness without materially changing end-user behavior.

**Architecture:** Introduce shared Zod-backed webview protocol contracts, isolate active run/session management from message routing, move sidebar state into a cached targeted-refresh store, and split the webview into a typed bootstrap plus focused rendering modules.

**Tech Stack:** TypeScript, VS Code extension API, Zod, Node test runner

---

1. Audit repository hygiene and remove unused secret material.
2. Define shared schemas/types for sidebar state and extension/webview messages.
3. Extract run/session state management so active runs are exclusive and paused interventions are preserved safely.
4. Replace `extension.ts` switch-heavy message handling with typed handlers and targeted state refreshes.
5. Cache provider runtime state and Notion MCP status so project/document actions do not trigger provider CLI checks.
6. Split the sidebar webview into shell/bootstrap, state/message handling, event wiring, renderers, and markdown helpers.
7. Add regression tests for run re-entry, intervention safety, payload validation, targeted refresh behavior, and webview helpers.
8. Update README and `.gitignore`, then run the full test suite.
