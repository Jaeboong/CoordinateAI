export const markdownSource = String.raw`
      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function renderMarkdown(value) {
        const normalized = String(value ?? "").replace(/\r\n/g, "\n").trim();
        if (!normalized) {
          return "&nbsp;";
        }

        const codeBlocks = [];
        let escaped = escapeHtml(normalized).replace(/\`\`\`([a-zA-Z0-9_-]+)?\n([\s\S]*?)\`\`\`/g, (_, language = "", code) => {
          const className = language ? \` class="language-\${language}"\` : "";
          const html = \`<pre><code\${className}>\${code.replace(/\n$/, "")}</code></pre>\`;
          const token = \`@@CODE_BLOCK_\${codeBlocks.length}@@\`;
          codeBlocks.push({ token, html });
          return token;
        });

        const lines = escaped.split("\n");
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

          const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
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

          const unordered = trimmed.match(/^[-*]\s+(.*)$/);
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

          const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
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

      function looksLikeTableRow(line) {
        return line.includes("|");
      }

      function isTableSeparatorRow(line) {
        if (!line || !line.includes("|")) {
          return false;
        }

        const cells = parseTableCells(line);
        return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
      }

      function parseTableAlignments(line) {
        return parseTableCells(line).map((cell) => {
          const compact = cell.replace(/\s+/g, "");
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
        const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
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

      function renderInlineMarkdown(value) {
        const codeTokens = [];
        let output = String(value ?? "").replace(/\`([^\`]+)\`/g, (_, code) => {
          const token = \`@@INLINE_CODE_\${codeTokens.length}@@\`;
          codeTokens.push({ token, html: \`<code>\${code}</code>\` });
          return token;
        });

        output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
          return \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${label}</a>\`;
        });
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
        output = output.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");

        for (const token of codeTokens) {
          output = output.replace(token.token, token.html);
        }
        return output;
      }

      function conversationChip(label) {
        return \`<span class="chip">\${escapeHtml(label)}</span>\`;
      }

      function formatChatSubtitle(message) {
        const pieces = [];
        if (isNotionPrepassMessage(message)) {
          pieces.push("노션 조사");
        } else if (message.speakerRole) {
          pieces.push(speakerRoleLabel(message.speakerRole));
          if (message.round !== undefined) {
            pieces.push(\`\${message.round}라운드\`);
          }
        }

        if (message.speakerRole === "user" && message.recipient) {
          pieces.push(\`\${message.recipient}에게\`);
        }

        return pieces.join(" • ");
      }
`;
