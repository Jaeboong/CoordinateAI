export const insightWorkspaceStyles = String.raw`
      :root {
        color-scheme: light dark;
        --bg: var(--vscode-editor-background);
        --panel: color-mix(in srgb, var(--vscode-sideBar-background) 74%, var(--bg));
        --panel-strong: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--bg));
        --border: var(--vscode-sideBar-border, rgba(128, 128, 128, 0.28));
        --muted: var(--vscode-descriptionForeground);
        --accent: var(--vscode-button-background);
        --accent-fg: var(--vscode-button-foreground);
        --chip: color-mix(in srgb, var(--accent) 14%, transparent);
        --shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 10%, transparent), transparent 34%),
          linear-gradient(180deg, color-mix(in srgb, var(--bg) 94%, #0f172a 6%), var(--bg));
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
      }

      body {
        padding: 24px;
      }

      .layout {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }

      .sidebar,
      .surface,
      .context-rail {
        border: 1px solid var(--border);
        border-radius: 22px;
        background: color-mix(in srgb, var(--panel) 90%, transparent);
        box-shadow: var(--shadow);
      }

      .sidebar {
        padding: 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        position: sticky;
        top: 24px;
      }

      .project-name {
        font-size: 28px;
        line-height: 1.1;
        margin: 0;
      }

      .project-role {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .nav-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .nav-button {
        width: 100%;
        text-align: left;
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        padding: 12px 14px;
        border-radius: 14px;
        cursor: pointer;
      }

      .nav-button:hover {
        border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
        background: color-mix(in srgb, var(--panel-strong) 74%, transparent);
      }

      .nav-button.active {
        background: var(--chip);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        font-weight: 700;
      }

      .sidebar-actions {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .action-link {
        color: inherit;
        text-decoration: none;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel-strong) 76%, transparent);
      }

      .surface-shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 18px;
      }

      .surface {
        padding: 22px 24px 28px;
      }

      .context-rail {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: sticky;
        top: 24px;
      }

      .page-label {
        color: var(--muted);
        font-size: 13px;
        letter-spacing: 0.02em;
      }

      .page-title {
        font-size: 34px;
        line-height: 1.15;
        margin: 8px 0 0;
      }

      .top-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        background: var(--chip);
        font-size: 12px;
      }

      .section-divider {
        height: 1px;
        margin: 22px 0;
        background: color-mix(in srgb, var(--border) 80%, transparent);
      }

      .markdown-body {
        line-height: 1.75;
        font-size: 15px;
      }

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4 {
        line-height: 1.25;
        margin: 28px 0 12px;
      }

      .markdown-body p {
        margin: 0 0 14px;
      }

      .markdown-body ul,
      .markdown-body ol {
        padding-left: 22px;
        margin: 0 0 16px;
      }

      .markdown-body li + li {
        margin-top: 6px;
      }

      .markdown-body code {
        font-family: var(--vscode-editor-font-family, monospace);
        padding: 2px 6px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--panel-strong) 88%, transparent);
      }

      .markdown-body pre {
        overflow: auto;
        padding: 14px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--panel-strong) 92%, transparent);
        border: 1px solid var(--border);
      }

      .markdown-body pre code {
        padding: 0;
        background: transparent;
      }

      .markdown-body a {
        color: var(--accent);
      }

      .table-wrap {
        overflow: auto;
        border-radius: 14px;
        border: 1px solid var(--border);
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 10px 12px;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
      }

      thead th {
        text-align: left;
        background: color-mix(in srgb, var(--panel-strong) 92%, transparent);
      }

      .empty-state {
        padding: 16px 18px;
        border-radius: 16px;
        border: 1px dashed var(--border);
        color: var(--muted);
        background: color-mix(in srgb, var(--panel-strong) 70%, transparent);
      }

      .rail-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: 16px;
        background: color-mix(in srgb, var(--panel-strong) 86%, transparent);
        border: 1px solid var(--border);
      }

      .rail-title {
        font-size: 13px;
        color: var(--muted);
      }

      .rail-value {
        font-size: 14px;
        line-height: 1.6;
      }

      @media (max-width: 1100px) {
        .surface-shell {
          grid-template-columns: 1fr;
        }

        .context-rail {
          position: static;
        }
      }

      @media (max-width: 860px) {
        body {
          padding: 16px;
        }

        .layout {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
        }
      }
`;
