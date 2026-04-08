interface InsightWorkspaceDocumentView {
  key: string;
  tabLabel: string;
  title: string;
  content: string;
  available: boolean;
}

export interface InsightWorkspaceState {
  projectSlug: string;
  companyName: string;
  roleName?: string;
  jobPostingUrl?: string;
  postingAnalyzedAt?: string;
  insightLastGeneratedAt?: string;
  openDartCorpName?: string;
  openDartStockCode?: string;
  documents: InsightWorkspaceDocumentView[];
}

export function buildInsightWorkspaceScript(state: InsightWorkspaceState): string {
  const serialized = JSON.stringify(state).replace(/</g, "\\u003c");
  return `
      const vscode = acquireVsCodeApi();
      const workspaceState = ${serialized};
      let activeTab = workspaceState.documents.find((item) => item.available)?.key || workspaceState.documents[0]?.key || "company";

      function reportClientError(error, phase) {
        const message = error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : String(error ?? "알 수 없는 웹뷰 오류");
        const stack = error instanceof Error && error.stack ? String(error.stack) : undefined;
        vscode.postMessage({
          type: "webviewClientError",
          source: "insightWorkspace",
          message,
          stack,
          href: location.href,
          phase
        });
      }

      window.addEventListener("error", (event) => {
        const detail = event.error instanceof Error
          ? event.error
          : new Error(event.message || "웹뷰 스크립트 오류");
        reportClientError(detail, "window.error");
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason ?? "Unhandled promise rejection"));
        reportClientError(reason, "window.unhandledrejection");
      });

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function renderMarkdown(value) {
        const normalized = String(value ?? "").replace(/\\r\\n/g, "\\n").trim();
        if (!normalized) {
          return "";
        }

        const codeBlocks = [];
        let escaped = escapeHtml(normalized).replace(/\\\`\\\`\\\`([a-zA-Z0-9_-]+)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (_, language = "", code) => {
          const className = language ? \` class="language-\${language}"\` : "";
          const html = \`<pre><code\${className}>\${code.replace(/\\n$/, "")}</code></pre>\`;
          const token = \`@@CODE_BLOCK_\${codeBlocks.length}@@\`;
          codeBlocks.push({ token, html });
          return token;
        });

        const lines = escaped.split("\\n");
        const html = [];
        let paragraph = [];
        let listType = null;

        function flushParagraph() {
          if (paragraph.length === 0) {
            return;
          }
          html.push(\`<p>\${renderInlineMarkdown(paragraph.join("<br />"))}</p>\`);
          paragraph = [];
        }

        function flushList() {
          if (!listType) {
            return;
          }
          html.push(\`</\${listType}>\`);
          listType = null;
        }

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const trimmed = line.trim();
          if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
          }

          const heading = trimmed.match(/^(#{1,4})\\s+(.*)$/);
          if (heading) {
            flushParagraph();
            flushList();
            const level = heading[1].length;
            html.push(\`<h\${level}>\${renderInlineMarkdown(heading[2])}</h\${level}>\`);
            continue;
          }

          const nextTrimmed = lines[index + 1]?.trim() || "";
          if (looksLikeTableRow(trimmed) && isTableSeparatorRow(nextTrimmed)) {
            flushParagraph();
            flushList();
            const bodyRows = [];
            const alignments = parseTableAlignments(nextTrimmed);
            index += 1;

            while (index + 1 < lines.length) {
              const candidate = lines[index + 1].trim();
              if (!candidate || !looksLikeTableRow(candidate)) {
                break;
              }
              bodyRows.push(candidate);
              index += 1;
            }

            html.push(renderTable(trimmed, bodyRows, alignments));
            continue;
          }

          const unordered = trimmed.match(/^[-*]\\s+(.*)$/);
          if (unordered) {
            flushParagraph();
            if (listType !== "ul") {
              flushList();
              listType = "ul";
              html.push("<ul>");
            }
            html.push(\`<li>\${renderInlineMarkdown(unordered[1])}</li>\`);
            continue;
          }

          const ordered = trimmed.match(/^\\d+\\.\\s+(.*)$/);
          if (ordered) {
            flushParagraph();
            if (listType !== "ol") {
              flushList();
              listType = "ol";
              html.push("<ol>");
            }
            html.push(\`<li>\${renderInlineMarkdown(ordered[1])}</li>\`);
            continue;
          }

          flushList();
          paragraph.push(trimmed);
        }

        flushParagraph();
        flushList();

        let output = html.join("");
        for (const block of codeBlocks) {
          output = output.replace(block.token, block.html);
        }
        return output;
      }

      function renderInlineMarkdown(value) {
        const codeTokens = [];
        let output = String(value ?? "").replace(/\\\`([^\\\`]+)\\\`/g, (_, code) => {
          const token = \`@@INLINE_CODE_\${codeTokens.length}@@\`;
          codeTokens.push({ token, html: \`<code>\${code}</code>\` });
          return token;
        });

        output = output.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, (_, label, url) => {
          return \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${label}</a>\`;
        });
        output = output.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
        output = output.replace(/(^|[\\s(])\\*([^*]+)\\*(?=[\\s).,!?]|$)/g, "$1<em>$2</em>");
        output = output.replace(/(^|[\\s(])_([^_]+)_(?=[\\s).,!?]|$)/g, "$1<em>$2</em>");

        for (const token of codeTokens) {
          output = output.replace(token.token, token.html);
        }
        return output;
      }

      function looksLikeTableRow(line) {
        return line.includes("|");
      }

      function isTableSeparatorRow(line) {
        if (!line || !line.includes("|")) {
          return false;
        }

        const cells = parseTableCells(line);
        return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\\s+/g, "")));
      }

      function parseTableAlignments(line) {
        return parseTableCells(line).map((cell) => {
          const compact = cell.replace(/\\s+/g, "");
          const left = compact.startsWith(":");
          const right = compact.endsWith(":");
          if (left && right) {
            return "center";
          }
          if (right) {
            return "right";
          }
          return "left";
        });
      }

      function parseTableCells(line) {
        const trimmed = line.trim().replace(/^\\|/, "").replace(/\\|$/, "");
        return trimmed.split("|").map((cell) => cell.trim());
      }

      function renderTable(headerLine, bodyLines, alignments) {
        const headers = parseTableCells(headerLine);
        const width = headers.length;
        const head = headers.map((cell, index) => \`<th style="text-align:\${alignments[index] || "left"}">\${renderInlineMarkdown(cell)}</th>\`).join("");
        const body = bodyLines.map((row) => {
          const cells = parseTableCells(row);
          const filled = Array.from({ length: width }, (_, index) => cells[index] || "");
          return \`<tr>\${filled.map((cell, index) => \`<td style="text-align:\${alignments[index] || "left"}">\${renderInlineMarkdown(cell)}</td>\`).join("")}</tr>\`;
        }).join("");
        return \`<div class="table-wrap"><table><thead><tr>\${head}</tr></thead><tbody>\${body}</tbody></table></div>\`;
      }

      function formatTimestamp(value) {
        if (!value) {
          return "아직 없음";
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return String(value);
        }
        return parsed.toLocaleString();
      }

      function activeDocument() {
        return workspaceState.documents.find((item) => item.key === activeTab) || workspaceState.documents[0];
      }

      function render() {
        const nav = document.getElementById("nav-list");
        const content = document.getElementById("workspace-content");
        const rail = document.getElementById("workspace-rail");
        const current = activeDocument();
        if (!nav || !content || !rail || !current) {
          return;
        }

        nav.innerHTML = workspaceState.documents.map((document) => \`
          <button class="nav-button \${document.key === activeTab ? "active" : ""}" type="button" data-tab="\${document.key}">
            \${escapeHtml(document.tabLabel)}
          </button>
        \`).join("");

        content.innerHTML = current.available
          ? \`
            <div class="page-label">\${escapeHtml(current.tabLabel)}</div>
            <div class="top-row">
              <div>
                <h1 class="page-title">\${escapeHtml(current.title || workspaceState.companyName)}</h1>
              </div>
              <div class="chips">
                <span class="chip">프로젝트 \${escapeHtml(workspaceState.projectSlug)}</span>
                \${workspaceState.openDartCorpName ? \`<span class="chip">OpenDART \${escapeHtml(workspaceState.openDartCorpName)}\${workspaceState.openDartStockCode ? \` • \${escapeHtml(workspaceState.openDartStockCode)}\` : ""}</span>\` : ""}
              </div>
            </div>
            <div class="section-divider"></div>
            <article class="markdown-body">\${renderMarkdown(current.content)}</article>
          \`
          : \`
            <div class="page-label">\${escapeHtml(current.tabLabel)}</div>
            <h1 class="page-title">\${escapeHtml(current.title || current.tabLabel)}</h1>
            <div class="section-divider"></div>
            <div class="empty-state">아직 생성된 문서가 없습니다. 사이드바에서 인사이트를 다시 생성해 주세요.</div>
          \`;

        rail.innerHTML = \`
          <div class="rail-card">
            <div class="rail-title">회사 / 포지션</div>
            <div class="rail-value">\${escapeHtml(workspaceState.companyName)}\${workspaceState.roleName ? \`<br />\${escapeHtml(workspaceState.roleName)}\` : ""}</div>
          </div>
          <div class="rail-card">
            <div class="rail-title">최근 공고 분석</div>
            <div class="rail-value">\${escapeHtml(formatTimestamp(workspaceState.postingAnalyzedAt))}</div>
          </div>
          <div class="rail-card">
            <div class="rail-title">최근 인사이트 생성</div>
            <div class="rail-value">\${escapeHtml(formatTimestamp(workspaceState.insightLastGeneratedAt))}</div>
          </div>
          \${workspaceState.jobPostingUrl ? \`
            <div class="rail-card">
              <div class="rail-title">공고 링크</div>
              <div class="rail-value"><a href="\${workspaceState.jobPostingUrl}" target="_blank" rel="noopener noreferrer">\${escapeHtml(workspaceState.jobPostingUrl)}</a></div>
            </div>
          \` : ""}
        \`;
      }

      document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-tab]");
        if (!target) {
          return;
        }
        activeTab = target.dataset.tab || activeTab;
        render();
      });

      render();
  `;
}
