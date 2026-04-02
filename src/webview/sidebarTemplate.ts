import * as vscode from "vscode";
import { sidebarStyles } from "./sidebarStyles";
import { buildSidebarScript } from "./sidebarScript";

export function buildSidebarHtml(webview: vscode.Webview, nonce: string): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    "img-src data:"
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ForJob</title>
    <style>
${sidebarStyles}
    </style>
  </head>
  <body>
    <div class="shell">
      <div id="banner"></div>
      <div class="tabs" id="tabs"></div>
      <div id="content"></div>
    </div>
    <div id="modal-root"></div>
    <input id="profile-file-input" class="hidden" type="file" multiple />
    <input id="project-file-input" class="hidden" type="file" multiple />
    <script nonce="${nonce}">
${buildSidebarScript()}
    </script>
  </body>
</html>`;
}
