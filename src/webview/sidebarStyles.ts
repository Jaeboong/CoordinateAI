export const sidebarStyles = String.raw`
      :root {
        color-scheme: light dark;
        --bg: var(--vscode-editor-background);
        --panel: var(--vscode-sideBar-background);
        --border: var(--vscode-sideBar-border, rgba(128, 128, 128, 0.35));
        --muted: var(--vscode-descriptionForeground);
        --accent: var(--vscode-button-background);
        --accent-fg: var(--vscode-button-foreground);
        --chip: color-mix(in srgb, var(--accent) 16%, transparent);
        --danger: #f87171;
        --success: #34d399;
        --speaker-codex: #111111;
        --speaker-claude: #c76a1b;
        --speaker-gemini: #1896d3;
        --speaker-user: var(--accent);
        --speaker-system: var(--muted);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --speaker-codex: #f3f4f6;
          --speaker-claude: #f59e0b;
          --speaker-gemini: #7dd3fc;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
      }

      body.modal-open {
        overflow: hidden;
      }

      button, input, textarea, select {
        font: inherit;
      }

      .shell {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tab {
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        border-radius: 999px;
        padding: 5px 12px;
        min-height: 30px;
        line-height: 1.2;
        cursor: pointer;
      }

      .tab:hover {
        border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
        background: color-mix(in srgb, var(--panel) 78%, transparent);
      }

      .tab.active {
        background: var(--chip);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        font-weight: 600;
      }

      .banner {
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 80%, transparent);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .banner.error {
        border-color: color-mix(in srgb, var(--danger) 65%, var(--border));
      }

      .banner-status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .banner-queue {
        font-size: 12px;
        color: var(--muted);
        white-space: nowrap;
      }

      .card {
        background: color-mix(in srgb, var(--panel) 88%, transparent);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .row.space {
        justify-content: space-between;
      }

      .muted {
        color: var(--muted);
      }

      .stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--chip);
        font-size: 12px;
      }

      .chip.ok {
        background: color-mix(in srgb, var(--success) 20%, transparent);
      }

      .chip.bad {
        background: color-mix(in srgb, var(--danger) 18%, transparent);
      }

      .grid {
        display: grid;
        gap: 8px;
      }

      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      input[type="text"], input[type="password"], textarea, select, input[type="number"] {
        width: 100%;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        padding: 8px 10px;
      }

      textarea {
        min-height: 120px;
        resize: vertical;
      }

      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .button {
        border: 1px solid transparent;
        background: var(--accent);
        color: var(--accent-fg);
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
      }

      .button.secondary {
        background: transparent;
        border-color: var(--border);
        color: inherit;
      }

      .button.danger {
        background: color-mix(in srgb, var(--danger) 20%, transparent);
        color: inherit;
        border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
      }

      .button:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .button.loading,
      select.loading-field,
      input.loading-field {
        position: relative;
      }

      .button.loading {
        pointer-events: none;
      }

      .button.loading::before {
        content: "";
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, var(--accent-fg) 35%, transparent);
        border-top-color: var(--accent-fg);
        display: inline-block;
        margin-right: 8px;
        animation: spin 0.8s linear infinite;
        vertical-align: -2px;
      }

      select.loading-field,
      input.loading-field {
        animation: fieldPulse 0.9s ease-in-out infinite alternate;
      }

      .doc-list, .run-list, .project-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .projects-screen {
        gap: 14px;
      }

      .projects-toolbar {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .projects-selector {
        flex: 1 1 320px;
      }

      .project-inline-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 0;
        border-top: 1px solid var(--border);
      }

      .collapsible-shell {
        gap: 0;
      }

      .collapsible-toggle {
        width: 100%;
        border: 0;
        padding: 0;
        margin: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .collapsible-panel {
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
        transition: grid-template-rows 0.16s ease, opacity 0.16s ease;
      }

      .collapsible-shell.open .collapsible-panel {
        grid-template-rows: 1fr;
        opacity: 1;
      }

      .collapsible-panel-inner {
        min-height: 0;
        overflow: hidden;
        padding-top: 0;
        transform: translateY(-4px);
        transition: transform 0.16s ease, padding-top 0.16s ease;
      }

      .collapsible-shell.open .collapsible-panel-inner {
        padding-top: 10px;
        transform: translateY(0);
      }

      .project-workspace {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding-top: 4px;
      }

      .project-summary {
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }

      .project-info-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .project-fold {
        border-top: 1px solid var(--border);
        padding-top: 12px;
      }

      .project-fold-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .project-fold-title {
        font-weight: 700;
      }

      .project-fold-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }

      .project-fold-state-closed {
        display: none;
      }

      .collapsible-shell.open .project-fold-state-open {
        display: inline;
      }

      .collapsible-shell.open .project-fold-state-closed {
        display: none;
      }

      .collapsible-shell:not(.open) .project-fold-state-open {
        display: none;
      }

      .collapsible-shell:not(.open) .project-fold-state-closed {
        display: inline;
      }

      .project-fold-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 92%, transparent);
      }

      .project-fold-body {
        margin-top: 0;
      }

      .project-create-shell .collapsible-panel-inner {
        padding-top: 0;
      }

      .section-heading {
        font-weight: 700;
      }

      .doc-item, .run-item, .project-item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .profile-doc-item {
        gap: 0;
      }

      .doc-item-header {
        align-items: flex-start;
      }

      .doc-preview-trigger {
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }

      .doc-preview-trigger:hover .doc-preview-header strong,
      .doc-preview-trigger:focus-visible .doc-preview-header strong {
        color: var(--accent);
      }

      .doc-preview-trigger:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
        outline-offset: 4px;
        border-radius: 8px;
      }

      .doc-preview-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .doc-preview-hint {
        flex: 0 0 auto;
        font-size: 11px;
        color: var(--accent);
        border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
        border-radius: 999px;
        padding: 4px 8px;
        background: color-mix(in srgb, var(--accent) 8%, transparent);
      }

      .run-log {
        min-height: 88px;
        max-height: 160px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        background: color-mix(in srgb, var(--panel) 90%, black 6%);
        white-space: pre-wrap;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
      }

      .chat-log {
        min-height: 260px;
        max-height: 560px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
        background: color-mix(in srgb, var(--panel) 92%, black 5%);
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .chat-message {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .chat-message.assistant {
        align-items: flex-start;
      }

      .chat-message.system {
        align-items: center;
      }

      .chat-message.user {
        align-items: flex-end;
      }

      .chat-meta {
        font-size: 11px;
        color: var(--muted);
      }

      .speaker-name {
        font-weight: 800;
      }

      .speaker-name.provider-codex {
        color: var(--speaker-codex);
      }

      .speaker-name.provider-claude {
        color: var(--speaker-claude);
      }

      .speaker-name.provider-gemini {
        color: var(--speaker-gemini);
      }

      .speaker-name.provider-user {
        color: var(--speaker-user);
      }

      .speaker-name.provider-system {
        color: var(--speaker-system);
      }

      .chat-subtitle {
        color: var(--muted);
      }

      .chat-bubble {
        max-width: 90%;
        border-radius: 14px;
        padding: 10px 12px;
        line-height: 1.45;
        border: 1px solid var(--border);
      }

      .chat-bubble.plain {
        white-space: pre-wrap;
      }

      .chat-bubble.markdown {
        white-space: normal;
      }

      .chat-bubble.markdown > :first-child {
        margin-top: 0;
      }

      .chat-bubble.markdown > :last-child {
        margin-bottom: 0;
      }

      .chat-bubble.markdown h1,
      .chat-bubble.markdown h2,
      .chat-bubble.markdown h3,
      .chat-bubble.markdown h4 {
        margin: 0.2em 0 0.55em;
        line-height: 1.25;
      }

      .chat-bubble.markdown p {
        margin: 0 0 0.75em;
      }

      .chat-bubble.markdown ul,
      .chat-bubble.markdown ol {
        margin: 0.25em 0 0.9em 1.1em;
        padding: 0;
      }

      .chat-bubble.markdown li + li {
        margin-top: 0.28em;
      }

      .chat-bubble.markdown a {
        color: var(--vscode-textLink-foreground);
      }

      .chat-bubble.markdown code {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.95em;
        background: color-mix(in srgb, var(--panel) 80%, black 10%);
        border-radius: 6px;
        padding: 0.1em 0.35em;
      }

      .chat-bubble.markdown pre {
        margin: 0.2em 0 0.9em;
        padding: 10px 12px;
        overflow: auto;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 88%, black 8%);
      }

      .chat-bubble.markdown pre code {
        background: transparent;
        padding: 0;
      }

      .chat-bubble.markdown .table-wrap {
        margin: 0.25em 0 0.9em;
        overflow-x: auto;
      }

      .chat-bubble.markdown table {
        width: 100%;
        border-collapse: collapse;
        min-width: 420px;
      }

      .chat-bubble.markdown th,
      .chat-bubble.markdown td {
        border: 1px solid var(--border);
        padding: 7px 9px;
        vertical-align: top;
        text-align: left;
      }

      .chat-bubble.markdown thead th {
        background: color-mix(in srgb, var(--panel) 76%, black 8%);
        font-weight: 600;
      }

      .conversation-card {
        gap: 12px;
      }

      .run-setup-card {
        gap: 0;
      }

      .run-setup-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .run-setup-summary-meta {
        justify-content: flex-end;
      }

      .run-setup-body {
        margin-top: 0;
      }

      .collapsible-chevron {
        transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
      }

      .collapsible-shell.open .collapsible-chevron {
        transform: rotate(180deg);
      }

      .conversation-composer-host {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .conversation-composer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 10px;
        background: color-mix(in srgb, var(--panel) 94%, black 4%);
      }

      .conversation-composer textarea {
        min-height: 56px;
        max-height: 180px;
        resize: vertical;
        border-radius: 14px;
        padding: 12px 14px;
      }

      .conversation-composer textarea:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .conversation-composer-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .conversation-composer-hint {
        flex: 1 1 240px;
      }

      .conversation-composer-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .composer-submit {
        border-radius: 999px;
        padding-inline: 14px;
      }

      .conversation-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .discussion-ledger-summary-host[hidden] {
        display: none;
      }

      .discussion-ledger-summary {
        border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
        border-radius: 14px;
        padding: 12px;
        background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .discussion-ledger-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }

      .discussion-ledger-block {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        background: color-mix(in srgb, var(--panel) 94%, transparent);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .discussion-ledger-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--muted);
      }

      .discussion-ledger-value {
        line-height: 1.5;
      }

      .discussion-ledger-value > :first-child {
        margin-top: 0;
      }

      .discussion-ledger-value > :last-child {
        margin-bottom: 0;
      }

      .discussion-ledger-list {
        margin: 0;
        padding-left: 18px;
      }

      .discussion-ledger-list li + li {
        margin-top: 6px;
      }

      .activity-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 24px;
      }

      .activity-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        font-size: 12px;
      }

      .activity-chip.thinking {
        background: color-mix(in srgb, #f59e0b 12%, var(--panel));
      }

      .activity-chip.writing {
        background: color-mix(in srgb, var(--accent) 12%, var(--panel));
      }

      .status-spinner {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, currentColor 28%, transparent);
        border-top-color: currentColor;
        animation: spin 0.8s linear infinite;
        flex: 0 0 auto;
      }

      .ellipsis-dots::after {
        content: "";
        display: inline-block;
        width: 1.2em;
        text-align: left;
        animation: ellipsis 1.2s steps(4, end) infinite;
      }

      .system-card {
        gap: 8px;
      }

      .system-card summary {
        cursor: pointer;
      }

      .chat-message.assistant .chat-bubble {
        background: color-mix(in srgb, var(--accent) 10%, var(--panel));
      }

      .chat-message.system .chat-bubble {
        background: color-mix(in srgb, var(--panel) 88%, transparent);
      }

      .chat-message.user .chat-bubble {
        background: color-mix(in srgb, var(--accent) 18%, var(--panel));
      }

      .streaming::after {
        content: "▋";
        margin-left: 2px;
        opacity: 0.7;
      }

      .small {
        font-size: 12px;
      }

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .selection-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 8px;
      }

      .selection-card {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        cursor: pointer;
      }

      .selection-card input[type="checkbox"] {
        margin-top: 2px;
      }

      .selection-card.disabled {
        opacity: 0.55;
        cursor: default;
      }

      .selection-card-title {
        font-weight: 600;
      }

      .run-document-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .run-document-chip {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        min-width: 0;
      }

      .run-document-chip.selected {
        border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
        background: color-mix(in srgb, var(--accent) 10%, var(--panel));
      }

      .run-document-toggle {
        width: 28px;
        height: 28px;
        padding: 0;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }

      .run-document-toggle.unselected {
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
      }

      .run-document-toggle.unselected:hover:not(:disabled) {
        background: color-mix(in srgb, var(--accent) 12%, transparent);
      }

      .run-document-toggle.selected {
        color: var(--danger);
        border-color: color-mix(in srgb, var(--danger) 50%, var(--border));
      }

      .run-document-toggle.selected:hover:not(:disabled) {
        background: color-mix(in srgb, var(--danger) 12%, transparent);
      }

      .run-document-toggle-icon {
        position: relative;
        display: inline-block;
        width: 12px;
        height: 12px;
      }

      .run-document-toggle-icon::before,
      .run-document-toggle-icon.plus::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 2px;
        border-radius: 999px;
        background: currentColor;
        transform: translateY(-50%);
      }

      .run-document-toggle-icon.plus::after {
        top: 0;
        bottom: 0;
        left: 50%;
        right: auto;
        width: 2px;
        height: auto;
        transform: translateX(-50%);
      }

      .role-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--panel) 94%, transparent);
      }

      .role-group-header {
        align-items: flex-start;
      }

      .role-row,
      .role-override-row {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: color-mix(in srgb, var(--panel) 92%, transparent);
      }

      .role-row-header,
      .role-override-header {
        align-items: flex-start;
      }

      .role-summary {
        justify-content: flex-end;
      }

      .role-provider-field {
        align-items: flex-start;
        width: fit-content;
        max-width: 100%;
      }

      .role-provider-select {
        width: auto;
        flex: 0 1 auto;
        field-sizing: content;
        min-width: 15ch;
        max-width: min(100%, 24ch);
        align-self: flex-start;
      }

      .role-advanced-toggle {
        white-space: nowrap;
      }

      .role-advanced-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px dashed color-mix(in srgb, var(--accent) 34%, var(--border));
        border-radius: 12px;
        background: color-mix(in srgb, var(--accent) 5%, var(--panel));
      }

      .role-override-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .participant-field {
        align-items: flex-start;
        width: fit-content;
        max-width: 100%;
      }

      .participant-select {
        width: auto;
        flex: 0 1 auto;
        field-sizing: content;
        min-width: 11ch;
        max-width: min(100%, 20ch);
        align-self: flex-start;
      }

      .toggle-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 6px 10px;
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        width: fit-content;
      }

      .toggle-pill input[type="checkbox"] {
        margin: 0;
      }

      .pin-toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: color-mix(in srgb, var(--panel) 92%, transparent);
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease;
      }

      .pin-toggle:hover {
        border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
        background: color-mix(in srgb, var(--chip) 65%, transparent);
      }

      .pin-toggle:focus-within {
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
      }

      .pin-toggle input[type="checkbox"] {
        position: absolute;
        inset: 0;
        margin: 0;
        opacity: 0;
        cursor: pointer;
      }

      .pin-icon {
        width: 11px;
        height: 14px;
        border: 1.5px solid var(--muted);
        border-radius: 2px 2px 0 0;
        clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
        background: transparent;
        transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
      }

      .pin-toggle input[type="checkbox"]:checked + .pin-icon {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 82%, transparent);
        transform: translateY(-1px);
      }

      .inline-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        padding: 18px 14px;
        background: color-mix(in srgb, black 42%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }

      .modal-dialog {
        width: min(760px, calc(100vw - 28px));
        max-height: calc(100vh - 36px);
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: color-mix(in srgb, var(--panel) 96%, black 4%);
        box-shadow: 0 18px 40px color-mix(in srgb, black 28%, transparent);
      }

      .modal-header {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel) 96%, black 4%);
      }

      .modal-body {
        padding: 16px;
      }

      .modal-close-button {
        white-space: nowrap;
      }

      .preview-content {
        margin: 0;
        max-height: 420px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        background: color-mix(in srgb, var(--panel) 92%, black 6%);
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        line-height: 1.5;
      }

      .preview-empty {
        padding: 6px 2px 2px;
      }

      .hidden {
        display: none;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes ellipsis {
        0% { content: ""; }
        25% { content: "."; }
        50% { content: ".."; }
        75% { content: "..."; }
        100% { content: ""; }
      }

      @keyframes fieldPulse {
        from {
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 20%, transparent);
          border-color: var(--border);
        }
        to {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        }
      }
`;
