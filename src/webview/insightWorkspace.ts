import * as vscode from "vscode";
import { buildInsightWorkspaceScript, InsightWorkspaceState } from "./insightWorkspaceScript";
import { insightWorkspaceStyles } from "./insightWorkspaceStyles";

export class ForJobInsightWorkspace {
  public static readonly viewType = "forjob.insightWorkspace";

  private panel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: unknown) => Promise<void>
  ) {}

  show(state: InsightWorkspaceState): void {
    if (this.panel) {
      this.panel.title = buildTitle(state);
      this.panel.webview.html = buildInsightWorkspaceHtml(this.panel.webview, state, getNonce());
      this.panel.reveal(vscode.ViewColumn.Active, true);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      ForJobInsightWorkspace.viewType,
      buildTitle(state),
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri]
      }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message) => {
      void this.onMessage(message);
    });
    this.panel.webview.html = buildInsightWorkspaceHtml(this.panel.webview, state, getNonce());
  }
}

function buildTitle(state: InsightWorkspaceState): string {
  const name = state.companyName || "ForJob Insight";
  return state.roleName ? `${name} · ${state.roleName}` : name;
}

function buildInsightWorkspaceHtml(webview: vscode.Webview, state: InsightWorkspaceState, nonce: string): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    "img-src data:"
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(buildTitle(state))}</title>
    <style>
${insightWorkspaceStyles}
    </style>
  </head>
  <body>
    <div class="layout">
      <aside class="sidebar">
        <div>
          <h1 class="project-name">${escapeHtml(state.companyName || "새 프로젝트")}</h1>
          ${state.roleName ? `<p class="project-role">${escapeHtml(state.roleName)}</p>` : ""}
        </div>
        <nav id="nav-list" class="nav-list"></nav>
        <div class="sidebar-actions">
          <div class="action-link">생성된 인사이트 문서는 이후 자소서 실행 컨텍스트에 자동 포함됩니다.</div>
        </div>
      </aside>
      <div class="surface-shell">
        <main class="surface" id="workspace-content"></main>
        <aside class="context-rail" id="workspace-rail"></aside>
      </div>
    </div>
    <script nonce="${nonce}">
${buildInsightWorkspaceScript(state)}
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 16; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
