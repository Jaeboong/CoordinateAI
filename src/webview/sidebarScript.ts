const stateSource = String.raw`
      const vscode = acquireVsCodeApi();
      const restored = vscode.getState() || {};
      let appState = null;
      let selectedTab = restored.selectedTab || "providers";
      let selectedProjectSlug = restored.selectedProjectSlug || null;
      let runLog = restored.runLog || [];
      let runChatMessages = restored.runChatMessages || [];
      let runContinuation = restored.runContinuation || null;
      let projectDocumentEditor = restored.projectDocumentEditor || null;
      let awaitingIntervention = restored.awaitingIntervention || null;
      let providerModelSelections = restored.providerModelSelections || {};
      let providerCustomModels = restored.providerCustomModels || {};
      let selectedReviewMode = restored.selectedReviewMode || null;
      let runCoordinatorSelection = restored.runCoordinatorSelection || null;
      let runReviewerSelections = Array.isArray(restored.runReviewerSelections) ? restored.runReviewerSelections : [];
      let runFormState = restored.runFormState || null;
      let runSetupCollapsed = Boolean(restored.runSetupCollapsed);
      let projectCreateExpanded = Boolean(restored.projectCreateExpanded);
      let bannerQueue = restored.bannerQueue || [];
      let activeTurnStates = restored.activeTurnStates || {};
      const pendingChatChunks = new Map();
      const pendingChatCompletion = new Set();
      const pendingFeedbackElements = new Set();
      let chatPumpHandle = null;
      let bannerDrainHandle = null;
      const customModelOptionValue = "__custom__";

      const tabLabels = {
        providers: "AI 도구",
        profile: "프로필",
        projects: "프로젝트",
        runs: "실행"
      };

      const providerLabels = {
        codex: "Codex",
        claude: "Claude Code",
        gemini: "Gemini"
      };

      const reviewModeLabels = {
        realtime: "실시간 대화형",
        deepFeedback: "심화 피드백"
      };

      const defaultReviewModeValue = "deepFeedback";

      function normalizeReviewMode(value) {
        return value === "realtime" ? "realtime" : defaultReviewModeValue;
      }

      function currentReviewMode() {
        const activeMode = appState?.runState?.status !== "idle" ? appState?.runState?.reviewMode : null;
        return normalizeReviewMode(
          activeMode ||
          selectedReviewMode ||
          runContinuation?.reviewMode ||
          appState?.preferences?.lastReviewMode ||
          defaultReviewModeValue
        );
      }

      function reviewModeLabel(value) {
        return reviewModeLabels[normalizeReviewMode(value)] || reviewModeLabels[defaultReviewModeValue];
      }

      function installStateLabel(installed) {
        return installed ? "설치됨" : "없음";
      }

      function authStatusLabel(status) {
        switch (status) {
          case "healthy":
            return "정상";
          case "missing":
            return "없음";
          case "unhealthy":
            return "문제";
          default:
            return "미확인";
        }
      }

      function runStatusLabel(status) {
        switch (status) {
          case "running":
            return "진행 중";
          case "completed":
            return "완료";
          case "failed":
            return "실패";
          default:
            return status || "";
        }
      }

      function documentScopeLabel(scope) {
        return scope === "profile" ? "프로필" : "프로젝트";
      }

      function speakerRoleLabel(role) {
        switch (role) {
          case "coordinator":
            return "코디네이터";
          case "reviewer":
            return "리뷰어";
          case "user":
            return "나";
          default:
            return "시스템";
        }
      }

      function reviewerCountLabel(count) {
        return \`리뷰어 \${count}명\`;
      }

      function runIterationLabel(run) {
        const unit = normalizeReviewMode(run.reviewMode) === "realtime" ? "라운드" : "사이클";
        return \`\${run.rounds} \${unit}\`;
      }

      function revisedDraftButtonLabel(run) {
        return normalizeReviewMode(run.reviewMode) === "realtime" ? "최종본 열기" : "수정 초안 열기";
      }

      function notionButtonState(provider) {
        if (!provider.notionMcpConfigured) {
          return {
            label: "Notion 연결",
            action: "connect-notion-mcp",
            className: "button secondary"
          };
        }

        if (provider.notionMcpConnected === false) {
          return {
            label: "Notion 다시 연결",
            action: "connect-notion-mcp",
            className: "button secondary"
          };
        }

        return {
          label: "Notion 연결 해제",
          action: "disconnect-notion-mcp",
          className: "button danger"
        };
      }

      function notionStatusText(provider) {
        if (provider.notionMcpMessage) {
          return provider.notionMcpMessage;
        }
        return "Notion MCP 상태를 아직 확인하지 않았습니다.";
      }

      function post(payload) {
        vscode.postMessage(payload);
      }

      function markPending(element) {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        const className = element.tagName === "BUTTON" ? "loading" : "loading-field";
        element.classList.add(className);
        pendingFeedbackElements.add(element);
      }

      function clearPendingFeedback() {
        for (const element of pendingFeedbackElements) {
          element.classList.remove("loading", "loading-field");
        }
        pendingFeedbackElements.clear();
      }

      function pushBanner(nextBanner) {
        if (!nextBanner?.message) {
          return;
        }

        const previous = bannerQueue[bannerQueue.length - 1];
        if (previous && previous.message === nextBanner.message && previous.kind === nextBanner.kind) {
          bannerQueue[bannerQueue.length - 1] = nextBanner;
          return;
        }

        bannerQueue = [...bannerQueue, nextBanner].slice(-6);
      }

      function cancelBannerDrain() {
        if (bannerDrainHandle) {
          clearTimeout(bannerDrainHandle);
          bannerDrainHandle = null;
        }
      }

      function scheduleBannerDrain() {
        if (bannerDrainHandle || appState?.busyMessage || appState?.runState?.status !== "idle" || bannerQueue.length === 0) {
          return;
        }

        bannerDrainHandle = setTimeout(() => {
          bannerDrainHandle = null;
          if (appState?.busyMessage || appState?.runState?.status !== "idle" || bannerQueue.length === 0) {
            return;
          }
          bannerQueue = bannerQueue.slice(0, -1);
          renderBanner();
          persistState();
          if (bannerQueue.length > 0) {
            scheduleBannerDrain();
          }
        }, 2600);
      }

      function clearActivityStates() {
        activeTurnStates = {};
      }

      function turnActivityKey(event) {
        return [event.participantId || event.providerId || "system", event.round ?? "-", event.speakerRole || "system"].join(":");
      }

      function updateTurnActivity(event) {
        if (event.type === "run-started" || event.type === "run-completed" || event.type === "run-failed") {
          clearActivityStates();
          return;
        }

        if (!event.providerId || !event.speakerRole || event.speakerRole === "system" || event.speakerRole === "user") {
          return;
        }

        const key = turnActivityKey(event);
        if (event.type === "turn-started") {
          activeTurnStates[key] = {
            providerId: event.providerId,
            participantId: event.participantId,
            participantLabel: event.participantLabel,
            round: event.round,
            role: event.speakerRole,
            phase: "thinking"
          };
          return;
        }

        if (event.type === "chat-message-started" || event.type === "chat-message-delta") {
          activeTurnStates[key] = {
            providerId: event.providerId,
            participantId: event.participantId,
            participantLabel: event.participantLabel,
            round: event.round,
            role: event.speakerRole,
            phase: "writing"
          };
          return;
        }

        if (event.type === "turn-completed" || event.type === "turn-failed") {
          delete activeTurnStates[key];
        }
      }

      async function handleFileInputChange(scope, input) {
        const files = [...(input.files || [])];
        if (files.length === 0) {
          return;
        }

        const uploads = await Promise.all(files.map(async (file) => ({
          fileName: file.name,
          contentBase64: await fileToBase64(file)
        })));

        if (scope === "profile") {
          post({ type: "uploadProfileFiles", files: uploads });
        } else {
          post({ type: "uploadProjectFiles", projectSlug: selectedProjectSlug, files: uploads });
        }

        input.value = "";
      }

      async function fileToBase64(file) {
        return arrayBufferToBase64(await file.arrayBuffer());
      }

      function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 32768;
        let binary = "";
        for (let index = 0; index < bytes.length; index += chunkSize) {
          const chunk = bytes.subarray(index, index + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
      }

      function persistState() {
        vscode.setState({
          selectedTab,
          selectedProjectSlug,
          runLog,
          runChatMessages,
          runContinuation,
          projectDocumentEditor,
          awaitingIntervention,
          providerModelSelections,
          providerCustomModels,
          selectedReviewMode,
          runCoordinatorSelection,
          runReviewerSelections,
          runFormState,
          runSetupCollapsed,
          projectCreateExpanded,
          bannerQueue,
          activeTurnStates
        });
      }

      function selectedProject() {
        return appState?.projects?.find((project) => project.record.slug === selectedProjectSlug) || null;
      }

      function healthyRunProviders() {
        return (appState?.providers || []).filter((provider) => provider.installed && provider.authStatus === "healthy");
      }

      function ensureRunFormState(extraDocuments) {
        if (!runFormState) {
          runFormState = {
            question: runContinuation?.question || "",
            draft: runContinuation?.draft || "",
            notionRequest: runContinuation?.notionRequest || "",
            continuationNote: "",
            selectedDocumentIds: [...(runContinuation?.selectedDocumentIds || [])]
          };
        }

        const availableIds = new Set((extraDocuments || []).map((document) => document.id));
        runFormState.selectedDocumentIds = (runFormState.selectedDocumentIds || []).filter((id) => availableIds.has(id));
      }

      function resetRunFormState(extraDocuments) {
        runContinuation = null;
        runFormState = {
          question: "",
          draft: "",
          notionRequest: "",
          continuationNote: "",
          selectedDocumentIds: []
        };
        runCoordinatorSelection = null;
        runReviewerSelections = [];
        syncRunProviderSelections(healthyRunProviders());
        ensureRunFormState(extraDocuments || []);
      }

      function syncRunProviderSelections(healthyProviders) {
        const healthyIds = new Set(healthyProviders.map((provider) => provider.providerId));
        if (healthyProviders.length === 0) {
          runCoordinatorSelection = null;
          runReviewerSelections = [];
          return;
        }

        const continuationCoordinator = runContinuation?.coordinatorProvider;
        if (!runCoordinatorSelection || !healthyIds.has(runCoordinatorSelection)) {
          const preferredCoordinator = appState?.preferences?.lastCoordinatorProvider;
          if (continuationCoordinator && healthyIds.has(continuationCoordinator)) {
            runCoordinatorSelection = continuationCoordinator;
          } else {
            runCoordinatorSelection = preferredCoordinator && healthyIds.has(preferredCoordinator)
              ? preferredCoordinator
              : healthyProviders[0].providerId;
          }
        }

        const sourceReviewers = runReviewerSelections.length > 0
          ? runReviewerSelections
          : (runContinuation?.reviewerProviders || []);
        const sanitizedReviewers = sourceReviewers.filter((providerId) => healthyIds.has(providerId));
        if (sanitizedReviewers.length > 0) {
          runReviewerSelections = sanitizedReviewers;
          return;
        }

        const fallbackReviewer = healthyProviders.find((provider) => provider.providerId !== runCoordinatorSelection)?.providerId
          || runCoordinatorSelection
          || healthyProviders[0]?.providerId
          || "";
        runReviewerSelections = fallbackReviewer ? [fallbackReviewer] : [];
      }

      function applyChatEvent(event) {
        const messageId = event.messageId;
        if (!messageId) {
          return;
        }

        if (event.type === "chat-message-started" && event.speakerRole === "coordinator" && event.round === 0) {
          collapseCoordinatorPrePass(event.providerId, messageId);
        }

        let message = runChatMessages.find((item) => item.id === messageId);
        if (!message) {
          message = {
            id: messageId,
            providerId: event.providerId,
            participantId: event.participantId,
            participantLabel: event.participantLabel,
            speaker: event.speakerRole === "user" ? "나" : event.participantLabel || providerLabels[event.providerId] || event.providerId || "시스템",
            speakerRole: event.speakerRole || "system",
            recipient: event.recipient,
            round: event.round,
            content: "",
            startedAt: event.timestamp,
            status: "streaming"
          };
          runChatMessages = [...runChatMessages, message];
        }

        if (event.type === "chat-message-started") {
          message.startedAt = event.timestamp;
          message.status = "streaming";
        }
        if (event.providerId) {
          message.providerId = event.providerId;
        }
        if (event.participantId) {
          message.participantId = event.participantId;
        }
        if (event.participantLabel) {
          message.participantLabel = event.participantLabel;
          if (message.speakerRole !== "user") {
            message.speaker = event.participantLabel;
          }
        }

        if (event.type === "chat-message-delta" && event.message) {
          const current = pendingChatChunks.get(messageId) || "";
          pendingChatChunks.set(messageId, current + event.message);
          scheduleChatPump();
        }

        if (event.type === "chat-message-completed") {
          pendingChatCompletion.add(messageId);
          scheduleChatPump();
        }
      }

      function collapseCoordinatorPrePass(providerId, currentMessageId) {
        const removedIds = runChatMessages
          .filter((message) => (
            message.id !== currentMessageId &&
            message.participantId === "coordinator" &&
            message.providerId === providerId &&
            message.speakerRole === "coordinator" &&
            message.round === 0
          ))
          .map((message) => message.id);

        if (removedIds.length === 0) {
          return;
        }

        runChatMessages = runChatMessages.filter((message) => !removedIds.includes(message.id));
        for (const messageId of removedIds) {
          pendingChatChunks.delete(messageId);
          pendingChatCompletion.delete(messageId);
        }
      }

      function scheduleChatPump() {
        if (chatPumpHandle) {
          return;
        }

        chatPumpHandle = setTimeout(pumpChatQueues, 16);
      }

      function pumpChatQueues() {
        chatPumpHandle = null;
        let changed = false;

        for (const message of runChatMessages) {
          const queued = pendingChatChunks.get(message.id) || "";
          if (queued) {
            const sliceLength = Math.min(queued.length, 12);
            message.content += queued.slice(0, sliceLength);
            const rest = queued.slice(sliceLength);
            if (rest) {
              pendingChatChunks.set(message.id, rest);
            } else {
              pendingChatChunks.delete(message.id);
            }
            changed = true;
          }

          if (!pendingChatChunks.has(message.id) && pendingChatCompletion.has(message.id)) {
            message.status = "completed";
            message.finishedAt = new Date().toISOString();
            pendingChatCompletion.delete(message.id);
            changed = true;
          }
        }

        if (changed) {
          renderChatLog();
          persistState();
        }

        if (pendingChatChunks.size > 0 || pendingChatCompletion.size > 0) {
          scheduleChatPump();
        }
      }

      function syncProviderSettingsState() {
        for (const provider of appState?.providers || []) {
          const options = provider.capabilities?.modelOptions || [];
          const configuredModel = provider.configuredModel || "";
          const matchesPreset = options.some((option) => option.value === configuredModel);
          const selectedValue = configuredModel
            ? (matchesPreset ? configuredModel : customModelOptionValue)
            : "";

          if (!(provider.providerId in providerModelSelections)) {
            providerModelSelections[provider.providerId] = selectedValue;
          } else if (
            providerModelSelections[provider.providerId] !== customModelOptionValue ||
            !providerCustomModels[provider.providerId]
          ) {
            providerModelSelections[provider.providerId] = selectedValue;
          }

          if (selectedValue === customModelOptionValue) {
            providerCustomModels[provider.providerId] = configuredModel;
          } else if (!(provider.providerId in providerCustomModels)) {
            providerCustomModels[provider.providerId] = "";
          }
        }
      }
`;

const messageHandlingSource = String.raw`
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.type === "state") {
          appState = message.payload;
          syncProviderSettingsState();
          selectedReviewMode = normalizeReviewMode(selectedReviewMode || runContinuation?.reviewMode || appState?.preferences?.lastReviewMode);
          const projects = appState.projects || [];
          if (!selectedProjectSlug || !projects.some((project) => project.record.slug === selectedProjectSlug)) {
            selectedProjectSlug = projects[0]?.record.slug || null;
          }
          if (runContinuation && runContinuation.projectSlug !== selectedProjectSlug) {
            runContinuation = null;
          }
          if (projectDocumentEditor && projectDocumentEditor.projectSlug !== selectedProjectSlug) {
            projectDocumentEditor = null;
          }
          if (!appState?.busyMessage && appState?.runState?.status === "idle") {
            clearPendingFeedback();
          }
          render();
          persistState();
        } else if (message.type === "continuationPreset") {
          runContinuation = message.payload;
          selectedReviewMode = normalizeReviewMode(runContinuation?.reviewMode);
          runCoordinatorSelection = runContinuation?.coordinatorProvider || runCoordinatorSelection;
          runReviewerSelections = [...(runContinuation?.reviewerProviders || [])];
          runFormState = {
            question: runContinuation?.question || "",
            draft: runContinuation?.draft || "",
            notionRequest: runContinuation?.notionRequest || "",
            continuationNote: "",
            selectedDocumentIds: [...(runContinuation?.selectedDocumentIds || [])]
          };
          runSetupCollapsed = false;
          selectedProjectSlug = runContinuation?.projectSlug || selectedProjectSlug;
          selectedTab = "runs";
          render();
          persistState();
        } else if (message.type === "projectDocumentEditorPreset") {
          projectDocumentEditor = message.payload;
          selectedProjectSlug = projectDocumentEditor?.projectSlug || selectedProjectSlug;
          selectedTab = "projects";
          render();
          persistState();
        } else if (message.type === "runEvent") {
          const payload = message.payload;
          updateTurnActivity(payload);
          if (payload.type === "awaiting-user-input") {
            awaitingIntervention = {
              round: payload.round,
              message: payload.message
            };
            renderConversationComposer();
          } else if (payload.type === "user-input-received") {
            awaitingIntervention = null;
            renderConversationComposer();
          }
          if ((payload.type || "").startsWith("chat-message-")) {
            applyChatEvent(payload);
            renderChatLog();
          } else {
            const actor = payload.participantLabel || payload.providerId || "system";
            const line = \`[\${new Date(payload.timestamp).toLocaleTimeString()}] \${actor} \${payload.type}\${payload.message ? " - " + payload.message.trim() : ""}\`;
            runLog = [...runLog, line].slice(-120);
            renderSystemLog();
          }
          renderActivityRow();
          persistState();
        } else if (message.type === "banner") {
          pushBanner(message.payload);
          clearPendingFeedback();
          renderBanner();
        }
      });
`;

const markdownSource = String.raw`
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
        if (message.speakerRole === "coordinator" && message.round === 0) {
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

const renderSource = String.raw`
      function render() {
        renderBanner();
        renderTabs();
        renderContent();
        renderChatLog();
        renderActivityRow();
        renderConversationComposer();
        renderSystemLog();
      }

      function renderBanner() {
        const el = document.getElementById("banner");
        if (!el) {
          return;
        }

        const workspaceError = !appState?.workspaceOpened
          ? { kind: "error", message: "ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.", busy: false }
          : null;
        const runBanner = appState?.runState?.status === "paused"
          ? { kind: "info", message: appState.runState.message || "세션이 일시정지되었습니다.", busy: false }
          : appState?.runState?.status === "running"
            ? { kind: "info", message: appState.runState.message || "세션이 진행 중입니다.", busy: true }
            : null;
        const busyBanner = appState?.busyMessage
          ? { kind: "info", message: appState.busyMessage, busy: true }
          : null;
        const queuedBanners = bannerQueue.filter((item) => item?.message);
        const active = workspaceError || runBanner || busyBanner || queuedBanners[queuedBanners.length - 1];
        const queuedCount = workspaceError
          ? (runBanner ? 1 : 0) + (busyBanner ? 1 : 0) + queuedBanners.length
          : runBanner
            ? (busyBanner ? 1 : 0) + queuedBanners.length
            : busyBanner
              ? queuedBanners.length
              : Math.max(0, queuedBanners.length - 1);

        if (!active) {
          cancelBannerDrain();
          el.innerHTML = "";
          return;
        }

        el.innerHTML = \`
          <div class="banner \${active.kind === "error" ? "error" : ""}">
            <div class="banner-status">
              \${active.busy ? '<span class="status-spinner"></span>' : ""}
              <span>\${escapeHtml(active.message)}</span>
            </div>
            \${queuedCount > 0 ? \`<span class="banner-queue">+\${queuedCount}개 대기</span>\` : ""}
          </div>
        \`;

        if (workspaceError || runBanner || busyBanner) {
          cancelBannerDrain();
        } else {
          scheduleBannerDrain();
        }
      }

      function renderTabs() {
        const el = document.getElementById("tabs");
        el.innerHTML = Object.entries(tabLabels)
          .map(([key, label]) => \`<button class="tab \${selectedTab === key ? "active" : ""}" data-action="switch-tab" data-tab="\${key}">\${label}</button>\`)
          .join("");
      }

      function renderContent() {
        const el = document.getElementById("content");
        if (!appState?.workspaceOpened) {
          el.innerHTML = '<div class="card">ForJob는 모든 프로필, 프로젝트, 실행 결과를 워크스페이스 내부에 저장하므로 워크스페이스 폴더가 필요합니다.</div>';
          return;
        }

        if (selectedTab === "providers") {
          el.innerHTML = renderProviders();
        } else if (selectedTab === "profile") {
          el.innerHTML = renderProfile();
        } else if (selectedTab === "projects") {
          el.innerHTML = renderProjects();
        } else {
          el.innerHTML = renderRuns();
        }
      }

      function renderChatLog() {
        const el = document.getElementById("run-chat");
        if (!el) {
          return;
        }

        if (runChatMessages.length === 0) {
          el.innerHTML = '<div class="muted small">아직 AI 대화가 없습니다. 실행을 시작하면 여기서 토론 흐름을 볼 수 있습니다.</div>';
          return;
        }

        el.innerHTML = runChatMessages.map((message) => {
          const subtitle = formatChatSubtitle(message);
          const messageClass = message.speakerRole === "system" ? "system" : message.speakerRole === "user" ? "user" : "assistant";
          const bubbleClass = message.status === "streaming" ? "plain" : "markdown";
          const speakerProviderClass = message.providerId
            ? \`provider-\${message.providerId}\`
            : message.speakerRole === "user"
              ? "provider-user"
              : "provider-system";
          const content = message.status === "streaming"
            ? escapeHtml(message.content || " ")
            : renderMarkdown(message.content || " ");
          return \`
            <div class="chat-message \${messageClass}">
              <div class="chat-meta"><span class="speaker-name \${speakerProviderClass}">\${escapeHtml(message.speaker)}</span>\${subtitle ? \`<span class="chat-subtitle"> • \${escapeHtml(subtitle)}</span>\` : ""}</div>
              <div class="chat-bubble \${bubbleClass} \${message.status === "streaming" ? "streaming" : ""}">\${content}</div>
            </div>
          \`;
        }).join("");
        el.scrollTop = el.scrollHeight;
      }

      function renderActivityRow() {
        const el = document.getElementById("run-activity");
        if (!el) {
          return;
        }

        const states = Object.values(activeTurnStates || {});
        if (states.length === 0) {
          if (appState?.runState?.status === "paused") {
            el.innerHTML = '<span class="activity-chip"><span>세션 일시정지</span></span>';
            return;
          }
          if (appState?.runState?.status === "running" || appState?.busyMessage) {
            el.innerHTML = '<span class="activity-chip thinking"><span class="status-spinner"></span><span>준비 중<span class="ellipsis-dots"></span></span></span>';
            return;
          }
          el.innerHTML = '<span class="muted small">대기 중</span>';
          return;
        }

        el.innerHTML = states.map((state) => {
          const providerName = state.participantLabel || providerLabels[state.providerId] || state.providerId || "시스템";
          const phaseLabel = state.phase === "writing" ? "작성 중" : "생각 중";
          return \`
            <span class="activity-chip \${state.phase}">
              <span class="status-spinner"></span>
              <span>\${escapeHtml(providerName)} • \${phaseLabel}<span class="ellipsis-dots"></span></span>
            </span>
          \`;
        }).join("");
      }

      function renderConversationComposer() {
        const el = document.getElementById("run-composer");
        if (!el) {
          return;
        }

        const project = selectedProject();
        const latestRun = project?.runs?.[0];
        const runStatus = appState?.runState?.status || "idle";
        const activeRealtime = runStatus !== "idle" && appState?.runState?.reviewMode === "realtime";
        const continuationDisabledAttr = appState?.busyMessage || runStatus !== "idle" ? "disabled" : "";

        if (activeRealtime) {
          const paused = runStatus === "paused";
          el.innerHTML = \`
            <form id="round-intervention-form" class="conversation-composer">
              <textarea
                id="round-intervention-input"
                name="message"
                placeholder="\${paused ? "비워두면 계속 진행하고, /done을 입력하면 종료합니다" : "대화에 메시지를 보내세요"}"
              ></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">\${escapeHtml(
                  paused
                    ? (appState?.runState?.message || "대화가 일시정지되었습니다. 메시지를 보내거나, 비워둔 채 계속 진행하거나, /done으로 종료할 수 있습니다.")
                    : "언제든 메시지를 보낼 수 있습니다. 현재 작성 중인 모델이 먼저 마무리한 뒤 코디네이터가 대화 방향을 다시 잡습니다."
                )}</div>
                <div class="conversation-composer-actions">
                  <button class="button composer-submit" type="submit">\${paused ? "보내고 계속하기" : "보내기"}</button>
                </div>
              </div>
            </form>
          \`;
          setTimeout(() => {
            document.getElementById("round-intervention-input")?.focus();
          }, 0);
          return;
        }

        if (awaitingIntervention) {
          el.innerHTML = \`
            <form id="round-intervention-form" class="conversation-composer">
              <textarea
                id="round-intervention-input"
                name="message"
                placeholder="비워둔 채 Enter를 누르면 계속 진행하고, /done을 입력하면 종료합니다"
              ></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">\${escapeHtml(awaitingIntervention.message || "사이클이 끝났습니다. Enter로 계속 진행하거나, 다음 사이클 메모를 남기거나, /done으로 종료할 수 있습니다.")}</div>
                <div class="conversation-composer-actions">
                  <button class="button composer-submit" type="submit">계속하기</button>
                </div>
              </div>
            </form>
          \`;
          setTimeout(() => {
            document.getElementById("round-intervention-input")?.focus();
          }, 0);
          return;
        }

        if (runStatus === "running") {
          el.innerHTML = \`
            <div class="conversation-composer">
              <textarea disabled placeholder="다음 사이클이 멈추면 입력창이 자동으로 열립니다."></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">심화 피드백에서는 사이클이 멈췄을 때만 메모를 남길 수 있습니다.</div>
                <div class="conversation-composer-actions">
                  <button class="button secondary composer-submit" type="button" disabled>대기 중</button>
                </div>
              </div>
            </div>
          \`;
          return;
        }

        if (latestRun) {
          el.innerHTML = \`
            <form id="completed-run-composer-form" class="conversation-composer">
              <textarea
                id="completed-run-message"
                name="message"
                placeholder="다음에 어떻게 수정할지 적고 이어서 논의하세요"
                \${continuationDisabledAttr}
              ></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">가장 최근 실행이 끝났습니다. 후속 요청을 적고 이 최종본을 기준으로 논의를 이어가세요.</div>
                <div class="conversation-composer-actions">
                  <button class="button composer-submit" type="submit" data-project-slug="\${project.record.slug}" data-run-id="\${latestRun.record.id}" \${continuationDisabledAttr}>논의 이어가기</button>
                </div>
              </div>
            </form>
          \`;
          return;
        }

        el.innerHTML = \`
          <div class="conversation-composer">
            <textarea disabled placeholder="실행을 시작하면 여기에서 대화를 이어갈 수 있습니다."></textarea>
            <div class="conversation-composer-footer">
              <div class="muted small conversation-composer-hint">먼저 실행을 시작하세요. 실시간 대화와 후속 입력창이 여기에 나타납니다.</div>
            </div>
          </div>
        \`;
      }

      function renderSystemLog() {
        const el = document.getElementById("run-log");
        if (el) {
          el.textContent = runLog.join("\n");
          el.scrollTop = el.scrollHeight;
        }
      }
`;

const pageRendererSource = String.raw`
      function providerModelSelectionValue(provider) {
        if (providerModelSelections[provider.providerId] !== undefined) {
          return providerModelSelections[provider.providerId];
        }

        const configuredModel = provider.configuredModel || "";
        const matchesPreset = (provider.capabilities?.modelOptions || []).some((option) => option.value === configuredModel);
        return configuredModel
          ? (matchesPreset ? configuredModel : customModelOptionValue)
          : "";
      }

      function renderProviders() {
        return \`
          <div class="stack">
            <div class="card">
              <div class="row space">
                <div>
                  <strong>AI 도구 상태</strong>
                  <div class="muted small">설치 여부는 자동으로 확인됩니다. 인증 상태는 연결 테스트를 눌러야 갱신됩니다.</div>
                </div>
                <button class="button secondary" data-action="open-storage-root">저장 폴더 열기</button>
              </div>
            </div>
            \${appState.providers.map((provider) => {
              const statusClass = provider.authStatus === "healthy" ? "ok" : provider.authStatus === "missing" || provider.authStatus === "unhealthy" ? "bad" : "";
              const notionButton = notionButtonState(provider);
              const modelSelection = providerModelSelectionValue(provider);
              const customModel = providerCustomModels[provider.providerId] || provider.configuredModel || "";
              return \`
                <div class="card">
                  <div class="row space">
                    <div>
                      <strong>\${escapeHtml(providerLabels[provider.providerId] || provider.providerId)}</strong>
                      <div class="muted small">\${escapeHtml(provider.command)}\${provider.version ? " • " + escapeHtml(provider.version) : ""}</div>
                    </div>
                    <div class="row">
                      <span class="chip \${provider.installed ? "ok" : "bad"}">\${installStateLabel(provider.installed)}</span>
                      <span class="chip \${statusClass}">인증: \${authStatusLabel(provider.authStatus)}</span>
                    </div>
                  </div>
                  <div class="settings-grid">
                    <label>
                      인증 방식
                      <select data-action="set-auth-mode" data-provider="\${provider.providerId}">
                        <option value="cli" \${provider.authMode === "cli" ? "selected" : ""}>CLI 로그인</option>
                        <option value="apiKey" \${provider.authMode === "apiKey" ? "selected" : ""}>API 키</option>
                      </select>
                    </label>
                    <label>
                      모델
                      <select data-action="set-provider-model" data-provider="\${provider.providerId}">
                        \${(provider.capabilities?.modelOptions || []).map((option) => \`
                          <option value="\${escapeHtml(option.value)}" \${modelSelection === option.value ? "selected" : ""}>\${escapeHtml(option.label)}</option>
                        \`).join("")}
                      </select>
                    </label>
                    \${modelSelection === customModelOptionValue ? \`
                      <label>
                        사용자 모델
                        <div class="row">
                          <input id="custom-model-\${provider.providerId}" type="text" value="\${escapeHtml(customModel)}" placeholder="정확한 모델명을 입력하세요" />
                          <button class="button secondary" type="button" data-action="save-custom-model" data-provider="\${provider.providerId}">적용</button>
                        </div>
                      </label>
                    \` : ""}
                    <label>
                      추론 강도
                      <select data-action="set-provider-effort" data-provider="\${provider.providerId}" \${provider.capabilities?.supportsEffort ? "" : "disabled"}>
                        \${provider.capabilities?.supportsEffort
                          ? (provider.capabilities.effortOptions || []).map((option) => \`
                              <option value="\${escapeHtml(option.value)}" \${(provider.configuredEffort || "") === option.value ? "selected" : ""}>\${escapeHtml(option.label)}</option>
                            \`).join("")
                          : '<option value="">지원 안 함</option>'}
                      </select>
                    </label>
                  </div>
                  <div class="muted small">
                    \${provider.capabilities?.supportsEffort ? "이 도구는 모델과 추론 강도를 모두 설정할 수 있습니다." : "이 도구는 현재 모델만 설정할 수 있습니다."}
                  </div>
                  \${provider.authMode === "apiKey" ? \`
                    <div class="grid two">
                      <label>
                        API 키
                        <input id="apikey-\${provider.providerId}" type="password" placeholder="\${provider.hasApiKey ? "저장된 키는 숨겨집니다" : "API 키를 붙여넣으세요"}" />
                      </label>
                      <div class="actions" style="align-self:end">
                        <button class="button" data-action="save-api-key" data-provider="\${provider.providerId}">저장</button>
                        <button class="button secondary" data-action="clear-api-key" data-provider="\${provider.providerId}">키 지우기</button>
                      </div>
                    </div>
                  \` : ""}
                  \${provider.lastError ? \`<div class="muted small">\${escapeHtml(provider.lastError)}</div>\` : ""}
                  <div class="muted small">Notion MCP 프리셋: 공식 호스팅 서버 https://mcp.notion.com/mcp</div>
                  <div class="muted small">\${escapeHtml(notionStatusText(provider))}</div>
                  <div class="actions">
                    <button class="button" data-action="test-provider" data-provider="\${provider.providerId}" \${!provider.installed ? "disabled" : ""}>연결 테스트</button>
                    <button class="\${notionButton.className}" data-action="\${notionButton.action}" data-provider="\${provider.providerId}" \${!provider.installed ? "disabled" : ""}>\${notionButton.label}</button>
                    <button class="button secondary" data-action="check-notion-mcp" data-provider="\${provider.providerId}" \${!provider.installed ? "disabled" : ""}>Notion MCP 확인</button>
                  </div>
                </div>
              \`;
            }).join("")}
          </div>
        \`;
      }

      function renderProfile() {
        return \`
          <div class="stack">
            <div class="card">
              <div class="row space">
                <div>
                  <strong>공통 프로필 컨텍스트</strong>
                  <div class="muted small">기본 포함된 문서는 모든 프로젝트 실행에 자동으로 들어갑니다.</div>
                </div>
                <button class="button secondary" data-action="add-profile-files">파일 가져오기</button>
              </div>
            </div>

            <form id="profile-text-form" class="card">
              <strong>텍스트 직접 추가</strong>
              <label>제목<input name="title" type="text" placeholder="경력 요약" required /></label>
              <label>내용<textarea name="content" placeholder="텍스트 컨텍스트를 붙여넣으세요" required></textarea></label>
              <label>메모<input name="note" type="text" placeholder="선택 메모" /></label>
              <div class="inline-toggle-row">
                <span class="muted small">기본 포함된 문서는 모든 실행에 자동으로 들어갑니다.</span>
                <label class="toggle-pill"><input name="pinnedByDefault" type="checkbox" /> <span>기본 포함</span></label>
              </div>
              <div class="actions"><button class="button" type="submit">저장</button></div>
            </form>

            <div class="card">
              <strong>프로필 문서</strong>
              <div class="doc-list">\${renderDocuments(appState.profileDocuments, "profile")}</div>
            </div>
          </div>
        \`;
      }

      function renderProjects() {
        const project = selectedProject();
        const editor = projectDocumentEditor && projectDocumentEditor.projectSlug === selectedProjectSlug ? projectDocumentEditor : null;
        return \`
          <div class="stack projects-screen">
            <div class="projects-toolbar">
              <label class="projects-selector">
                <span>프로젝트 선택</span>
                <select data-action="set-selected-project">
                  \${appState.projects.length === 0
                    ? '<option value="">프로젝트가 없습니다</option>'
                    : appState.projects.map((item) => \`
                      <option value="\${item.record.slug}" \${item.record.slug === selectedProjectSlug ? "selected" : ""}>\${escapeHtml(item.record.companyName)}\${item.record.roleName ? " • " + escapeHtml(item.record.roleName) : ""}</option>
                    \`).join("")}
                </select>
              </label>
              <div class="actions">
                <button class="button secondary" type="button" data-action="toggle-project-create">\${projectCreateExpanded ? "생성 닫기" : "새 프로젝트"}</button>
              </div>
            </div>

            \${projectCreateExpanded ? \`
              <form id="project-form" class="project-inline-panel">
                <div class="section-heading">새 프로젝트</div>
                <div class="grid two">
                  <label>회사 이름<input name="companyName" type="text" placeholder="g마켓" required /></label>
                  <label>포지션<input name="roleName" type="text" placeholder="검색 엔진 및 Backend 개발 및 운영" /></label>
                </div>
                <label>주요 업무<textarea name="mainResponsibilities" placeholder="공고의 주요 업무를 붙여넣으세요"></textarea></label>
                <label>자격요건<textarea name="qualifications" placeholder="공고의 자격요건을 붙여넣으세요"></textarea></label>
                <div class="actions">
                  <button class="button" type="submit">프로젝트 만들기</button>
                </div>
              </form>
            \` : ""}

            \${project ? \`
              <div class="project-workspace">
                <div class="project-summary row space">
                  <div class="stack" style="gap:4px;">
                    <strong>\${escapeHtml(project.record.companyName)}</strong>
                    \${project.record.roleName ? \`<div class="muted small">\${escapeHtml(project.record.roleName)}</div>\` : ""}
                  </div>
                  <div class="muted small">슬러그: \${escapeHtml(project.record.slug)}</div>
                </div>

                <form id="project-info-form" class="project-info-form">
                  <div class="grid two">
                    <label>회사 이름<input name="companyName" type="text" value="\${escapeHtml(project.record.companyName)}" required /></label>
                    <label>포지션<input name="roleName" type="text" value="\${escapeHtml(project.record.roleName || "")}" placeholder="검색 엔진 및 Backend 개발 및 운영" /></label>
                  </div>
                  <label>주요 업무<textarea name="mainResponsibilities" placeholder="공고의 주요 업무를 붙여넣으세요">\${escapeHtml(project.record.mainResponsibilities || "")}</textarea></label>
                  <label>자격요건<textarea name="qualifications" placeholder="공고의 자격요건을 붙여넣으세요">\${escapeHtml(project.record.qualifications || "")}</textarea></label>
                  <div class="actions">
                    <button class="button" type="submit">저장</button>
                    <button class="button danger" type="button" data-action="delete-project">삭제</button>
                  </div>
                </form>

                <details class="project-fold" open>
                  <summary class="project-fold-summary">
                    <span class="project-fold-title">평가 기준</span>
                    <span class="project-fold-meta">
                      <span class="project-fold-state project-fold-state-open">열림</span>
                      <span class="project-fold-state project-fold-state-closed">접힘</span>
                      <span class="project-fold-chevron" aria-hidden="true">⌄</span>
                    </span>
                  </summary>
                  <div class="project-fold-body stack">
                    <label>평가 기준<textarea id="project-rubric">\${escapeHtml(project.record.rubric)}</textarea></label>
                    <div class="actions">
                      <button class="button" data-action="save-project-rubric">저장</button>
                      <button class="button secondary" type="button" data-action="reset-project-rubric">초기화</button>
                    </div>
                  </div>
                </details>

                <details class="project-fold" open>
                  <summary class="project-fold-summary">
                    <span class="project-fold-title">프로젝트 컨텍스트</span>
                    <span class="project-fold-meta">
                      <span class="project-fold-state project-fold-state-open">열림</span>
                      <span class="project-fold-state project-fold-state-closed">접힘</span>
                      <span class="project-fold-chevron" aria-hidden="true">⌄</span>
                    </span>
                  </summary>
                  <div class="project-fold-body stack">
                    <form id="project-text-form" class="project-inline-panel">
                      <div class="section-heading">\${editor ? "프로젝트 문서 수정" : "프로젝트 텍스트 추가"}</div>
                      <input name="documentId" type="hidden" value="\${escapeHtml(editor?.documentId || "")}" />
                      <label>제목<input name="title" type="text" placeholder="회사 노트" value="\${escapeHtml(editor?.title || "")}" required /></label>
                      \${editor && !editor.contentEditable ? \`
                        <div class="muted small">이 파일은 \${escapeHtml(editor.sourceType)} 형식으로 가져온 문서입니다. 여기서는 제목, 메모, 기본 포함 여부만 바꿀 수 있고, 내용은 삭제 후 새 파일을 다시 가져와야 바꿀 수 있습니다.</div>
                      \` : \`
                        <label>내용<textarea name="content" placeholder="회사별 메모를 붙여넣으세요" required>\${escapeHtml(editor?.content || "")}</textarea></label>
                      \`}
                      <label>메모<input name="note" type="text" placeholder="선택 메모" value="\${escapeHtml(editor?.note || "")}" /></label>
                      <div class="inline-toggle-row">
                        <span class="muted small">기본 포함된 프로젝트 문서는 모든 실행에 자동으로 들어갑니다.</span>
                        <label class="toggle-pill"><input name="pinnedByDefault" type="checkbox" \${editor?.pinnedByDefault ? "checked" : ""} /> <span>기본 포함</span></label>
                      </div>
                      <div class="actions">
                        <button class="button" type="submit">저장</button>
                        \${editor ? '<button class="button secondary" type="button" data-action="clear-project-document-editor">편집 취소</button>' : ""}
                        <button class="button secondary" type="button" data-action="add-project-files">파일 가져오기</button>
                      </div>
                    </form>

                    <div class="doc-list">\${renderProjectDocuments(project.documents)}</div>
                  </div>
                </details>
              </div>
            \` : '<div class="muted small">프로젝트를 만들거나 위 목록에서 선택하세요.</div>'}
          </div>
        \`;
      }

      function renderRuns() {
        const project = selectedProject();
        if (!project) {
          return '<div class="card">실행을 시작하기 전에 프로젝트를 만들고 선택하세요.</div>';
        }

        const healthyProviders = healthyRunProviders();
        syncRunProviderSelections(healthyProviders);
        const extraDocuments = [
          ...appState.profileDocuments.filter((document) => !document.pinnedByDefault),
          ...project.documents.filter((document) => !document.pinnedByDefault)
        ];
        ensureRunFormState(extraDocuments);
        const selectedCoordinator = runCoordinatorSelection || "";
        const selectedReviewers = [...runReviewerSelections];
        const formState = runFormState || {
          question: "",
          draft: "",
          notionRequest: "",
          continuationNote: "",
          selectedDocumentIds: []
        };
        const activeReviewMode = currentReviewMode();
        const continuationDisabledAttr = appState?.busyMessage || appState.runState?.status !== "idle" ? "disabled" : "";
        const healthyProviderIds = new Set(healthyProviders.map((provider) => provider.providerId));
        const canRunReview =
          appState.runState?.status === "idle" &&
          Boolean(selectedCoordinator) &&
          healthyProviderIds.has(selectedCoordinator) &&
          selectedReviewers.length >= 1 &&
          selectedReviewers.every((providerId) => healthyProviderIds.has(providerId));

        return \`
          <div class="stack">
            <div class="card">
              <strong>실행</strong>
              <label>
                프로젝트
                <select data-action="set-selected-project">
                  \${appState.projects.map((item) => \`
                    <option value="\${item.record.slug}" \${item.record.slug === selectedProjectSlug ? "selected" : ""}>\${escapeHtml(item.record.companyName)}\${item.record.roleName ? " • " + escapeHtml(item.record.roleName) : ""}</option>
                  \`).join("")}
                </select>
              </label>
              <div class="muted small">현재 프로젝트: \${escapeHtml(project.record.companyName)}. 코디네이터는 정확히 1명, 리뷰어는 최소 1명 선택해야 합니다. 현재 정상 도구: \${healthyProviders.map((provider) => provider.providerId).join(", ") || "없음"}.</div>
            </div>

            <details id="run-setup-details" class="card run-setup-card" \${runSetupCollapsed ? "" : "open"}>
              <summary class="run-setup-summary">
                <div class="stack" style="gap:4px;">
                  <strong>실행 설정</strong>
                  <div class="muted small">\${runSetupCollapsed ? "다음 실행에 쓸 질문, 컨텍스트, 참여자를 펼쳐서 수정하세요." : "다음 실행에 쓸 질문, 컨텍스트, 참여자를 설정하세요."}</div>
                </div>
                <div class="row">
                  <span class="chip">\${escapeHtml(reviewModeLabel(activeReviewMode))}</span>
                  <span class="chip">\${escapeHtml(selectedCoordinator || "코디네이터 없음")}</span>
                  <span class="chip">\${escapeHtml(reviewerCountLabel(selectedReviewers.length))}</span>
                </div>
              </summary>
              <div class="stack run-setup-body">
              \${runContinuation ? \`
                <div class="card">
                  <div class="row space">
                    <div>
                      <strong>\${escapeHtml(runContinuation.runId)}에서 이어서 진행</strong>
                      <div class="muted small">새 실행이 시작되지만, 이전 실행의 결과물과 최근 대화는 그대로 문맥으로 이어집니다.</div>
                    </div>
                    <button class="button secondary" data-action="clear-run-continuation">이어받기 해제</button>
                  </div>
                  <label>
                    이어서 요청
                    <textarea id="run-continuation-note" placeholder="다음 실행에서 더 다듬을 지점을 적으세요. 예: 협업 강조해서 다시 다듬어줘">\${escapeHtml(formState.continuationNote || "")}</textarea>
                  </label>
                </div>
              \` : ""}

              <div class="card">
              <label>자소서 질문<textarea id="run-question" placeholder="질문을 붙여넣으세요">\${escapeHtml(formState.question || "")}</textarea></label>
              <label>현재 초안<textarea id="run-draft" placeholder="현재 초안을 붙여넣으세요">\${escapeHtml(formState.draft || "")}</textarea></label>
              <label>노션 요청<textarea id="run-notion-request" placeholder="CJ 올리브네트웍스 페이지 가져와서 파악해">\${escapeHtml(formState.notionRequest || "")}</textarea></label>
              <div class="muted small">\${activeReviewMode === "realtime"
                ? "실시간 대화형은 짧은 토론을 이어가다가 모든 리뷰어가 승인하면 마지막에만 장문 최종본을 작성합니다. 중간에 언제든 메시지를 보내면 현재 쓰고 있던 모델만 마무리한 뒤 대화 방향이 바뀝니다."
                : "심화 피드백은 현재 방식 그대로 각 사이클마다 요약, 개선안, 수정 초안을 갱신합니다. Enter로 계속하고 <code>/done</code>으로 종료할 수 있습니다."}</div>
              \${appState.runState?.status !== "idle" ? \`<div class="muted small">진행 중인 실행: \${escapeHtml(appState.runState.message || appState.runState.status)}</div>\` : ""}
              <div class="stack">
                <strong>참여자</strong>
                <label class="participant-field">
                  코디네이터
                  <select class="participant-select" id="run-coordinator" data-action="set-run-coordinator" \${healthyProviders.length === 0 ? "disabled" : ""}>
                    \${healthyProviders.length === 0
                      ? '<option value="">정상 도구가 없습니다</option>'
                      : healthyProviders.map((provider) => \`
                        <option value="\${provider.providerId}" \${selectedCoordinator === provider.providerId ? "selected" : ""}>\${escapeHtml(providerLabels[provider.providerId] || provider.providerId)}</option>
                      \`).join("")}
                  </select>
                </label>
                <div class="stack reviewer-list">
                  <div class="row space">
                    <strong>리뷰어</strong>
                    <button class="button secondary" type="button" data-action="add-reviewer-row" \${healthyProviders.length === 0 || appState.runState?.status !== "idle" ? "disabled" : ""}>리뷰어 추가</button>
                  </div>
                  \${selectedReviewers.length === 0 ? '<div class="muted small">리뷰어를 1명 이상 추가하세요.</div>' : selectedReviewers.map((providerId, index) => \`
                    <div class="reviewer-row">
                      <span class="reviewer-slot-label">리뷰어 \${index + 1}</span>
                      <select class="participant-select" data-action="set-run-reviewer" data-index="\${index}" \${healthyProviders.length === 0 ? "disabled" : ""}>
                        \${healthyProviders.map((provider) => \`
                          <option value="\${provider.providerId}" \${providerId === provider.providerId ? "selected" : ""}>\${escapeHtml(providerLabels[provider.providerId] || provider.providerId)}</option>
                        \`).join("")}
                      </select>
                      <button
                        class="button secondary reviewer-remove-button"
                        type="button"
                        data-action="remove-reviewer-row"
                        data-index="\${index}"
                        title="리뷰어 제거"
                        aria-label="리뷰어 제거"
                        \${selectedReviewers.length <= 1 || appState.runState?.status !== "idle" ? "disabled" : ""}>
                        <span class="reviewer-remove-icon" aria-hidden="true"></span>
                      </button>
                    </div>
                  \`).join("")}
                </div>
              </div>
              <div class="stack">
                <strong>이번 실행에 추가할 문서</strong>
                \${extraDocuments.length === 0 ? '<div class="muted small">추가 문서가 없습니다. 기본 포함 문서는 이미 자동으로 들어갑니다.</div>' : \`<div class="run-document-list">\${extraDocuments.map((document) => {
                  const selected = formState.selectedDocumentIds?.includes(document.id);
                  return \`
                    <div class="run-document-chip \${selected ? "selected" : ""}">
                      <div class="stack" style="gap:4px;">
                        <span class="selection-card-title">\${escapeHtml(document.title)}</span>
                        <span class="muted small">\${escapeHtml(documentScopeLabel(document.scope))}</span>
                      </div>
                      <button
                        class="button secondary run-document-toggle \${selected ? "selected" : "unselected"}"
                        type="button"
                        data-action="toggle-run-extra-doc"
                        data-document-id="\${document.id}"
                        title="\${selected ? "문서 제거" : "문서 추가"}"
                        aria-label="\${selected ? "문서 제거" : "문서 추가"}">
                        <span class="run-document-toggle-icon \${selected ? "minus" : "plus"}" aria-hidden="true"></span>
                      </button>
                    </div>
                  \`;
                }).join("")}</div>\`}
              </div>
              <div class="actions">
                <button class="button" data-action="run-review" \${canRunReview ? "" : "disabled"}>실행</button>
                <button class="button secondary" type="button" data-action="reset-run-form" \${appState.runState?.status !== "idle" ? "disabled" : ""}>초기화</button>
              </div>
            </div>
            </div>
            </details>

            <div class="card conversation-card">
              <div class="row space">
                <strong>대화</strong>
                <label class="muted small">
                  <span style="display:block; margin-bottom:4px;">모드</span>
                  <select data-action="set-review-mode" \${appState.runState?.status !== "idle" ? "disabled" : ""}>
                    <option value="realtime" \${activeReviewMode === "realtime" ? "selected" : ""}>실시간 대화형</option>
                    <option value="deepFeedback" \${activeReviewMode === "deepFeedback" ? "selected" : ""}>심화 피드백</option>
                  </select>
                </label>
              </div>
              <div class="conversation-meta">
                \${conversationChip(\`모드: \${reviewModeLabel(activeReviewMode)}\`)}
                \${conversationChip(\`코디네이터: \${selectedCoordinator || "없음"}\`)}
                \${conversationChip(\`리뷰어: \${selectedReviewers.length}명\`)}
                \${conversationChip(\`정상 도구: \${healthyProviders.length}\`)}
                \${conversationChip("개입: 자동 일시정지")}
                \${conversationChip("마크다운: 완료")}
              </div>
              <div id="run-activity" class="activity-row"></div>
              <div id="run-chat" class="chat-log"></div>
              <div id="run-composer" class="conversation-composer-host"></div>
            </div>

            <div class="card system-card">
              <details>
                <summary><strong>시스템 스트림</strong></summary>
                <div class="muted small" style="margin-top:8px;">디버깅용으로 raw 실행 이벤트, 도구 호출, stdout, stderr를 여기에 그대로 보관합니다.</div>
                <div id="run-log" class="run-log" style="margin-top:8px;"></div>
              </details>
            </div>

            <div class="card">
              <strong>최근 실행</strong>
              <div class="run-list">
                \${project.runs.length === 0 ? '<div class="muted">아직 실행 기록이 없습니다.</div>' : project.runs.map((run) => \`
                  <div class="run-item">
                    <div class="row space">
                      <div>
                        <strong>\${escapeHtml(run.record.id)}</strong>
                        <div class="muted small">\${escapeHtml(runStatusLabel(run.record.status))} • \${escapeHtml(run.record.startedAt)}</div>
                      </div>
                      <div class="row">
                        <span class="chip">\${escapeHtml(reviewModeLabel(run.record.reviewMode))}</span>
                        <span class="chip">\${escapeHtml(run.record.coordinatorProvider)}</span>
                        <span class="chip">\${escapeHtml(reviewerCountLabel(run.record.reviewerProviders.length))}</span>
                        <span class="chip">\${escapeHtml(runIterationLabel(run.record))}</span>
                      </div>
                    </div>
                    <div class="small">\${escapeHtml(run.summaryPreview || (normalizeReviewMode(run.record.reviewMode) === "realtime" ? "아직 최종본이 없습니다." : "아직 요약이 없습니다."))}</div>
                    \${run.record.notionRequest ? \`<div class="muted small">노션: \${escapeHtml(run.record.notionRequest)}</div>\` : ""}
                    \${run.record.continuationFromRunId ? \`<div class="muted small">이전 실행: \${escapeHtml(run.record.continuationFromRunId)}</div>\` : ""}
                    <div class="actions">
                      <button class="button" data-action="load-run-continuation" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" \${continuationDisabledAttr}>이어서 진행</button>
                      \${run.artifacts.summary ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="summary.md">요약 열기</button>\` : ""}
                      \${run.artifacts.improvementPlan ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="improvement-plan.md">개선안 열기</button>\` : ""}
                      \${run.artifacts.revisedDraft ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="revised-draft.md">\${escapeHtml(revisedDraftButtonLabel(run.record))}</button>\` : ""}
                      \${run.artifacts.notionBrief ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="notion-brief.md">노션 브리프 열기</button>\` : ""}
                      \${run.artifacts.chatMessages ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="chat-messages.json">채팅 메시지 열기</button>\` : ""}
                      \${run.artifacts.events ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="events.ndjson">이벤트 열기</button>\` : ""}
                    </div>
                  </div>
                \`).join("")}
              </div>
            </div>
          </div>
        \`;
      }

      function renderDocuments(documents, scope) {
        if (!documents || documents.length === 0) {
          return '<div class="muted">아직 문서가 없습니다.</div>';
        }

        return documents.map((document) => \`
          <div class="doc-item">
            <div class="row space">
              <div>
                <strong>\${escapeHtml(document.title)}</strong>
                <div class="muted small">\${escapeHtml(document.sourceType)} • \${escapeHtml(document.extractionStatus)}</div>
              </div>
              <label class="pin-toggle" title="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}">
                <input
                  type="checkbox"
                  aria-label="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}"
                  data-action="\${scope === "profile" ? "toggle-profile-pinned" : "toggle-project-pinned"}"
                  data-document-id="\${document.id}"
                  \${document.pinnedByDefault ? "checked" : ""}
                />
                <span class="pin-icon" aria-hidden="true"></span>
              </label>
            </div>
            \${document.note ? \`<div class="small">\${escapeHtml(document.note)}</div>\` : ""}
            <div class="muted small">\${escapeHtml(document.rawPath)}</div>
          </div>
        \`).join("");
      }

      function renderProjectDocuments(documents) {
        if (!documents || documents.length === 0) {
          return '<div class="muted">아직 프로젝트 문서가 없습니다.</div>';
        }

        return documents.map((document) => \`
          <div class="doc-item">
            <div class="row space">
              <div>
                <strong>\${escapeHtml(document.title)}</strong>
                <div class="muted small">\${escapeHtml(document.sourceType)} • \${escapeHtml(document.extractionStatus)}</div>
              </div>
              <label class="pin-toggle" title="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}">
                <input
                  type="checkbox"
                  aria-label="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}"
                  data-action="toggle-project-pinned"
                  data-document-id="\${document.id}"
                  \${document.pinnedByDefault ? "checked" : ""}
                />
                <span class="pin-icon" aria-hidden="true"></span>
              </label>
            </div>
            \${document.note ? \`<div class="small">\${escapeHtml(document.note)}</div>\` : ""}
            <div class="muted small">\${escapeHtml(document.rawPath)}</div>
            <div class="actions">
              <button class="button secondary" type="button" data-action="edit-project-document" data-document-id="\${document.id}">수정</button>
              <button class="button danger" type="button" data-action="delete-project-document" data-document-id="\${document.id}">삭제</button>
            </div>
          </div>
        \`).join("");
      }
`;

const domEventSource = String.raw`
      document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) {
          return;
        }

        const action = target.dataset.action;
        if (action === "switch-tab") {
          selectedTab = target.dataset.tab;
          render();
          persistState();
          return;
        }
        if (action === "test-provider") {
          markPending(target);
          post({ type: "testProvider", providerId: target.dataset.provider });
          return;
        }
        if (action === "connect-notion-mcp") {
          markPending(target);
          post({ type: "connectNotionMcp", providerId: target.dataset.provider });
          return;
        }
        if (action === "disconnect-notion-mcp") {
          markPending(target);
          post({ type: "disconnectNotionMcp", providerId: target.dataset.provider });
          return;
        }
        if (action === "check-notion-mcp") {
          markPending(target);
          post({ type: "checkNotionMcp", providerId: target.dataset.provider });
          return;
        }
        if (action === "save-api-key") {
          markPending(target);
          const providerId = target.dataset.provider;
          const input = document.getElementById(\`apikey-\${providerId}\`);
          post({ type: "saveApiKey", providerId, apiKey: input.value });
          input.value = "";
          return;
        }
        if (action === "save-custom-model") {
          const providerId = target.dataset.provider;
          const input = document.getElementById(\`custom-model-\${providerId}\`);
          const model = input?.value?.trim() || "";
          if (!model) {
            pushBanner({ kind: "error", message: "사용자 모델명은 비워둘 수 없습니다." });
            renderBanner();
            return;
          }
          providerCustomModels[providerId] = model;
          post({ type: "setProviderModel", providerId, model });
          return;
        }
        if (action === "clear-api-key") {
          markPending(target);
          post({ type: "clearApiKey", providerId: target.dataset.provider });
          return;
        }
        if (action === "add-profile-files") {
          document.getElementById("profile-file-input")?.click();
          return;
        }
        if (action === "add-project-files") {
          if (!selectedProjectSlug) {
            pushBanner({ kind: "error", message: "파일을 가져오기 전에 프로젝트를 먼저 선택하세요." });
            renderBanner();
            return;
          }
          document.getElementById("project-file-input")?.click();
          return;
        }
        if (action === "select-project") {
          selectedProjectSlug = target.dataset.projectSlug;
          if (projectDocumentEditor && projectDocumentEditor.projectSlug !== selectedProjectSlug) {
            projectDocumentEditor = null;
          }
          render();
          persistState();
          return;
        }
        if (action === "delete-project") {
          markPending(target);
          post({ type: "deleteProject", projectSlug: selectedProjectSlug });
          return;
        }
        if (action === "toggle-project-create") {
          projectCreateExpanded = !projectCreateExpanded;
          render();
          persistState();
          return;
        }
        if (action === "save-project-rubric") {
          markPending(target);
          const textarea = document.getElementById("project-rubric");
          post({ type: "saveProjectRubric", projectSlug: selectedProjectSlug, rubric: textarea.value });
          return;
        }
        if (action === "reset-project-rubric") {
          const textarea = document.getElementById("project-rubric");
          if (textarea) {
            textarea.value = "";
            textarea.focus();
          }
          return;
        }
        if (action === "edit-project-document") {
          markPending(target);
          post({
            type: "loadProjectDocumentEditor",
            projectSlug: selectedProjectSlug,
            documentId: target.dataset.documentId
          });
          return;
        }
        if (action === "delete-project-document") {
          markPending(target);
          post({
            type: "deleteProjectDocument",
            projectSlug: selectedProjectSlug,
            documentId: target.dataset.documentId
          });
          if (projectDocumentEditor?.documentId === target.dataset.documentId) {
            projectDocumentEditor = null;
            render();
            persistState();
          }
          return;
        }
        if (action === "clear-project-document-editor") {
          projectDocumentEditor = null;
          render();
          persistState();
          return;
        }
        if (action === "run-review") {
          markPending(target);
          submitRunForm();
          return;
        }
        if (action === "add-reviewer-row") {
          const fallbackProvider = healthyRunProviders()[0]?.providerId || "";
          if (!fallbackProvider) {
            return;
          }
          runReviewerSelections = [...runReviewerSelections, fallbackProvider];
          render();
          persistState();
          return;
        }
        if (action === "remove-reviewer-row") {
          const index = Number(target.dataset.index);
          if (!Number.isInteger(index) || runReviewerSelections.length <= 1) {
            return;
          }
          runReviewerSelections = runReviewerSelections.filter((_, itemIndex) => itemIndex !== index);
          render();
          persistState();
          return;
        }
        if (action === "toggle-run-extra-doc") {
          const documentId = target.dataset.documentId;
          if (!documentId) {
            return;
          }
          if (!runFormState) {
            runFormState = {
              question: "",
              draft: "",
              notionRequest: "",
              continuationNote: "",
              selectedDocumentIds: []
            };
          }
          const current = new Set(runFormState.selectedDocumentIds || []);
          if (current.has(documentId)) {
            current.delete(documentId);
          } else {
            current.add(documentId);
          }
          runFormState.selectedDocumentIds = [...current];
          render();
          persistState();
          return;
        }
        if (action === "load-run-continuation") {
          if (appState?.busyMessage || appState?.runState?.status !== "idle") {
            return;
          }
          markPending(target);
          post({
            type: "loadRunContinuation",
            projectSlug: target.dataset.projectSlug,
            runId: target.dataset.runId
          });
          return;
        }
        if (action === "clear-run-continuation") {
          runContinuation = null;
          render();
          persistState();
          return;
        }
        if (action === "reset-run-form") {
          resetRunFormState();
          runSetupCollapsed = false;
          render();
          persistState();
          return;
        }
        if (action === "open-artifact") {
          post({
            type: "openArtifact",
            projectSlug: target.dataset.projectSlug,
            runId: target.dataset.runId,
            fileName: target.dataset.fileName
          });
          return;
        }
        if (action === "open-storage-root") {
          markPending(target);
          post({ type: "openStorageRoot" });
        }
      });

      document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
          return;
        }

        const action = target.dataset.action;
        if (target.id === "profile-file-input") {
          void handleFileInputChange("profile", target);
          return;
        }
        if (target.id === "project-file-input") {
          void handleFileInputChange("project", target);
          return;
        }
        if (action === "set-auth-mode") {
          markPending(target);
          post({ type: "setAuthMode", providerId: target.dataset.provider, authMode: target.value });
          return;
        }
        if (action === "set-provider-model") {
          markPending(target);
          const providerId = target.dataset.provider;
          providerModelSelections[providerId] = target.value;
          if (target.value === customModelOptionValue) {
            render();
            persistState();
            return;
          }
          providerCustomModels[providerId] = "";
          post({ type: "setProviderModel", providerId, model: target.value });
          return;
        }
        if (action === "set-provider-effort") {
          markPending(target);
          post({ type: "setProviderEffort", providerId: target.dataset.provider, effort: target.value });
          return;
        }
        if (action === "set-review-mode") {
          selectedReviewMode = normalizeReviewMode(target.value);
          render();
          persistState();
          return;
        }
        if (action === "set-run-coordinator") {
          runCoordinatorSelection = target.value || null;
          render();
          persistState();
          return;
        }
        if (action === "set-run-reviewer") {
          const index = Number(target.dataset.index);
          if (!Number.isInteger(index)) {
            return;
          }
          runReviewerSelections[index] = target.value;
          render();
          persistState();
          return;
        }
        if (action === "set-selected-project") {
          selectedProjectSlug = target.value || null;
          if (runContinuation && runContinuation.projectSlug !== selectedProjectSlug) {
            runContinuation = null;
          }
          if (projectDocumentEditor && projectDocumentEditor.projectSlug !== selectedProjectSlug) {
            projectDocumentEditor = null;
          }
          render();
          persistState();
          return;
        }
        if (action === "toggle-profile-pinned") {
          markPending(target);
          post({ type: "toggleProfilePinned", documentId: target.dataset.documentId, pinned: target.checked });
          return;
        }
        if (action === "toggle-project-pinned") {
          markPending(target);
          post({ type: "toggleProjectPinned", projectSlug: selectedProjectSlug, documentId: target.dataset.documentId, pinned: target.checked });
        }
      });

      document.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement)) {
          return;
        }

        if (!runFormState) {
          runFormState = {
            question: "",
            draft: "",
            notionRequest: "",
            continuationNote: "",
            selectedDocumentIds: []
          };
        }

        if (target.id === "run-question") {
          runFormState.question = target.value;
          persistState();
          return;
        }
        if (target.id === "run-draft") {
          runFormState.draft = target.value;
          persistState();
          return;
        }
        if (target.id === "run-notion-request") {
          runFormState.notionRequest = target.value;
          persistState();
          return;
        }
        if (target.id === "run-continuation-note") {
          runFormState.continuationNote = target.value;
          persistState();
        }
      });

      document.addEventListener("toggle", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLDetailsElement) || target.id !== "run-setup-details") {
          return;
        }

        runSetupCollapsed = !target.open;
        persistState();
      });

      document.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLTextAreaElement) || !["round-intervention-input", "completed-run-message"].includes(target.id)) {
          return;
        }

        if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
          return;
        }

        event.preventDefault();
        target.form?.requestSubmit();
      });

      document.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) {
          return;
        }

        const data = new FormData(form);
        if (form.id === "profile-text-form") {
          markPending(event.submitter);
          post({
            type: "saveProfileText",
            title: data.get("title")?.toString() || "",
            content: data.get("content")?.toString() || "",
            note: data.get("note")?.toString() || "",
            pinnedByDefault: data.get("pinnedByDefault") === "on"
          });
          form.reset();
        }

        if (form.id === "project-form") {
          markPending(event.submitter);
          post({
            type: "createProject",
            companyName: data.get("companyName")?.toString() || "",
            roleName: data.get("roleName")?.toString() || "",
            mainResponsibilities: data.get("mainResponsibilities")?.toString() || "",
            qualifications: data.get("qualifications")?.toString() || ""
          });
          form.reset();
          projectCreateExpanded = false;
          persistState();
        }

        if (form.id === "project-info-form") {
          markPending(event.submitter);
          post({
            type: "updateProjectInfo",
            projectSlug: selectedProjectSlug,
            companyName: data.get("companyName")?.toString() || "",
            roleName: data.get("roleName")?.toString() || "",
            mainResponsibilities: data.get("mainResponsibilities")?.toString() || "",
            qualifications: data.get("qualifications")?.toString() || ""
          });
        }

        if (form.id === "project-text-form") {
          markPending(event.submitter);
          const documentId = data.get("documentId")?.toString() || "";
          const contentField = form.querySelector('[name="content"]');
          const content = contentField ? data.get("content")?.toString() || "" : undefined;
          if (documentId) {
            post({
              type: "updateProjectDocument",
              projectSlug: selectedProjectSlug,
              documentId,
              title: data.get("title")?.toString() || "",
              content,
              note: data.get("note")?.toString() || "",
              pinnedByDefault: data.get("pinnedByDefault") === "on"
            });
            projectDocumentEditor = null;
          } else {
            post({
              type: "saveProjectText",
              projectSlug: selectedProjectSlug,
              title: data.get("title")?.toString() || "",
              content: content || "",
              note: data.get("note")?.toString() || "",
              pinnedByDefault: data.get("pinnedByDefault") === "on"
            });
          }
          form.reset();
          render();
          persistState();
        }

        if (form.id === "round-intervention-form") {
          markPending(event.submitter);
          post({
            type: "submitRoundIntervention",
            message: data.get("message")?.toString() || ""
          });
          form.reset();
        }

        if (form.id === "completed-run-composer-form") {
          const submitter = event.submitter || form.querySelector('button[type="submit"]');
          const projectSlug = submitter?.dataset.projectSlug;
          const runId = submitter?.dataset.runId;
          if (!projectSlug || !runId) {
            return;
          }
          markPending(submitter);
          post({
            type: "continueRunDiscussion",
            projectSlug,
            runId,
            message: data.get("message")?.toString() || ""
          });
          form.reset();
        }
      });

      function submitRunForm() {
        const project = selectedProject();
        if (!project) {
          return;
        }

        const healthyIds = new Set(healthyRunProviders().map((provider) => provider.providerId));
        const coordinatorProvider = document.getElementById("run-coordinator")?.value || runCoordinatorSelection || "";
        const reviewerProviders = [...document.querySelectorAll('select[data-action="set-run-reviewer"]')]
          .map((input) => input.value)
          .filter(Boolean);
        if (!coordinatorProvider || !healthyIds.has(coordinatorProvider)) {
          pushBanner({ kind: "error", message: "정상 상태의 코디네이터를 1명 선택하세요." });
          renderBanner();
          return;
        }
        if (reviewerProviders.length < 1) {
          pushBanner({ kind: "error", message: "정상 상태의 리뷰어를 1명 이상 추가하세요." });
          renderBanner();
          return;
        }
        if (reviewerProviders.some((providerId) => !healthyIds.has(providerId))) {
          pushBanner({ kind: "error", message: "모든 리뷰어는 정상 상태의 도구를 사용해야 합니다." });
          renderBanner();
          return;
        }

        runCoordinatorSelection = coordinatorProvider;
        runReviewerSelections = reviewerProviders;
        runSetupCollapsed = true;

        runLog = [];
        runChatMessages = [];
        awaitingIntervention = null;
        clearActivityStates();
        pendingChatChunks.clear();
        pendingChatCompletion.clear();
        if (chatPumpHandle) {
          clearTimeout(chatPumpHandle);
          chatPumpHandle = null;
        }
        renderChatLog();
        renderConversationComposer();
        renderSystemLog();
        render();
        persistState();
        post({
          type: "runReview",
          projectSlug: project.record.slug,
          question: runFormState?.question || document.getElementById("run-question").value,
          draft: runFormState?.draft || document.getElementById("run-draft").value,
          reviewMode: currentReviewMode(),
          notionRequest: runFormState?.notionRequest || document.getElementById("run-notion-request").value,
          continuationFromRunId: runContinuation?.runId || "",
          continuationNote: runFormState?.continuationNote || document.getElementById("run-continuation-note")?.value || "",
          rounds: 1,
          coordinatorProvider,
          reviewerProviders,
          selectedDocumentIds: [...(runFormState?.selectedDocumentIds || [])]
        });
      }
`;

const bootSource = String.raw`
      post({ type: "ready" });
`;

export function buildSidebarScript(): string {
  return materializeInlineScript([
    stateSource,
    messageHandlingSource,
    markdownSource,
    renderSource,
    pageRendererSource,
    domEventSource,
    bootSource
  ].join("\n"));
}

function materializeInlineScript(source: string): string {
  return source
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${");
}
