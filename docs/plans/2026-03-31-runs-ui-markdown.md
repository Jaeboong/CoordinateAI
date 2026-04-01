# Runs UI Markdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Runs conversation view render completed AI messages as Markdown and improve readability by reducing coordinator pre-pass noise and demoting raw system logs.

**Architecture:** Keep the existing webview event model and chat state, but change only the rendering layer and the client-side message accumulation logic. Use a lightweight safe Markdown renderer in the webview, preserve plain-text streaming while a message is in progress, and collapse coordinator round-0 progress chatter so the final Notion research result is what remains in the conversation.

**Tech Stack:** VS Code webview, inline browser JavaScript, TypeScript, node:test

---

### Task 1: Document the approved UI direction

**Files:**
- Create: `docs/plans/2026-03-31-runs-ui-markdown-design.md`
- Create: `docs/plans/2026-03-31-runs-ui-markdown.md`

**Step 1: Save the approved design**

Write the approved `Conversation` and `System stream` policies into the design doc.

**Step 2: Save the implementation plan**

Write this plan with exact file targets and testing notes.

### Task 2: Add safe Markdown rendering for completed chat messages

**Files:**
- Modify: `src/webview/sidebar.ts`
- Test: `src/test/providerStreaming.test.ts`

**Step 1: Implement a minimal safe Markdown renderer**

Add a browser-side renderer that:
- escapes HTML first
- supports headings, lists, links, emphasis, inline code, fenced code blocks, paragraphs
- never allows raw HTML injection

**Step 2: Render plain text while streaming**

Keep streaming messages as escaped text until completion.

**Step 3: Render Markdown after completion**

Switch completed messages to the safe Markdown HTML renderer.

### Task 3: Reduce coordinator round-0 conversation noise

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Collapse pre-pass chatter**

When a new `coordinator` message for `round 0` starts, remove earlier coordinator round-0 assistant messages from the visible chat list.

**Step 2: Keep the last meaningful pre-pass result**

Allow the final completed round-0 message to remain so the user still sees the Notion research result.

### Task 4: Refine conversation and system log presentation

**Files:**
- Modify: `src/webview/sidebar.ts`

**Step 1: Improve chat metadata**

Show `speaker / role / round` metadata clearly and suppress assistant `recipient` noise like `to All`.

**Step 2: Soften the system stream**

Reduce system panel height and visual emphasis while keeping it available for debugging.

**Step 3: Improve chat bubble styling**

Tune spacing, widths, markdown typography, code blocks, and list readability.

### Task 5: Update docs and verify behavior

**Files:**
- Modify: `README.md`
- Test: `src/test/providerStreaming.test.ts`

**Step 1: Update the README**

Describe the new behavior:
- streaming plain text during generation
- markdown rendering after completion
- coordinator Notion pre-pass chatter collapsing

**Step 2: Run the full test suite**

Run: `npm run test`

Expected: all tests pass.
