export const stateSource = String.raw`
      const vscode = acquireVsCodeApi();
      const restored = vscode.getState() || {};
      const defaultCollapsibleStates = Object.freeze({
        runSetup: true,
        projectCreate: false,
        projectRubric: true,
        projectContext: true
      });
      let appState = null;
      let selectedTab = restored.selectedTab || "projects";
      let selectedProjectSlug = restored.selectedProjectSlug || null;
      let runLog = restored.runLog || [];
      let runChatMessages = restored.runChatMessages || [];
      let liveDiscussionLedger = restored.liveDiscussionLedger || null;
      let runContinuation = restored.runContinuation || null;
      let projectDocumentEditor = restored.projectDocumentEditor || null;
      let profileDocumentPreview = null;
      let awaitingIntervention = restored.awaitingIntervention || null;
      let providerModelSelections = restored.providerModelSelections || {};
      let providerCustomModels = restored.providerCustomModels || {};
      let selectedReviewMode = restored.selectedReviewMode || null;
      let runRoleAssignments = Array.isArray(restored.runRoleAssignments) ? restored.runRoleAssignments : [];
      let runRoleAdvancedOpen = Boolean(restored.runRoleAdvancedOpen);
      let runCoordinatorSelection = restored.runCoordinatorSelection || null;
      let runReviewerSelections = Array.isArray(restored.runReviewerSelections) ? restored.runReviewerSelections : [];
      let runFormState = normalizeRunFormStateStore(restored.runFormState);
      let settingsModalOpen = Boolean(restored.settingsModalOpen);
      let settingsModalTab = restored.settingsModalTab || "providers";
      let collapsibleStates = normalizeCollapsibleStates(restored.collapsibleStates, restored);
      let tabScrollPositions = restored.tabScrollPositions || {};
      let bannerQueue = restored.bannerQueue || [];
      let activeTurnStates = restored.activeTurnStates || {};
      const pendingChatChunks = new Map();
      const pendingChatCompletion = new Set();
      const pendingFeedbackElements = new Set();
      let chatPumpHandle = null;
      let bannerDrainHandle = null;
      let scrollRestoreHandle = null;
      let pendingInteractionScrollTop = null;
      const customModelOptionValue = "__custom__";

      const tabLabels = {
        projects: "프로젝트",
        runs: "자기소개서"
      };

      const settingsTabLabels = {
        providers: "AI 도구",
        openDart: "OpenDART",
        profile: "프로필"
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

      const runRoleDefinitions = Object.freeze([
        {
          roleKey: "context_researcher",
          label: "컨텍스트 리서처",
          groupKey: "research",
          description: "회사, 직무, 문항 맥락을 조사합니다."
        },
        {
          roleKey: "section_coordinator",
          label: "섹션 코디네이터",
          groupKey: "drafting",
          description: "조사 결과를 섹션별 작업으로 배분하고 순서를 잡습니다."
        },
        {
          roleKey: "section_drafter",
          label: "섹션 드래프터",
          groupKey: "drafting",
          description: "실제 초안을 작성합니다."
        },
        {
          roleKey: "fit_reviewer",
          label: "적합성 리뷰어",
          groupKey: "review",
          description: "직무와 회사에 맞는지 검토합니다."
        },
        {
          roleKey: "evidence_reviewer",
          label: "근거 리뷰어",
          groupKey: "review",
          description: "사실과 근거의 정확성을 확인합니다."
        },
        {
          roleKey: "voice_reviewer",
          label: "문체 리뷰어",
          groupKey: "review",
          description: "자기소개서의 목소리와 어조를 다듬습니다."
        },
        {
          roleKey: "finalizer",
          label: "파이널라이저",
          groupKey: "drafting",
          description: "모든 수정을 통합해 최종본으로 정리합니다."
        }
      ]);
      const runRoleDefinitionsByKey = Object.fromEntries(runRoleDefinitions.map((role) => [role.roleKey, role]));
      const runRoleOrder = runRoleDefinitions.map((role) => role.roleKey);
      const runRoleGroupOrder = Object.freeze(["research", "drafting", "review"]);
      const runRoleGroupLabels = {
        research: "조사",
        drafting: "작성",
        review: "검토"
      };
      const runReviewerRoleKeys = Object.freeze(["fit_reviewer", "evidence_reviewer", "voice_reviewer"]);

      const defaultReviewModeValue = "deepFeedback";

      function normalizeReviewMode(value) {
        return value === "realtime" ? "realtime" : defaultReviewModeValue;
      }

      function normalizeCollapsibleStates(raw, legacyState) {
        const next = { ...defaultCollapsibleStates };
        if (legacyState && typeof legacyState === "object") {
          if (typeof legacyState.runSetupCollapsed === "boolean") {
            next.runSetup = !legacyState.runSetupCollapsed;
          }
          if (typeof legacyState.projectCreateExpanded === "boolean") {
            next.projectCreate = legacyState.projectCreateExpanded;
          }
        }
        if (!raw || typeof raw !== "object") {
          return next;
        }
        for (const key of Object.keys(defaultCollapsibleStates)) {
          if (typeof raw[key] === "boolean") {
            next[key] = raw[key];
          }
        }
        return next;
      }

      function isCollapsibleOpen(key) {
        return collapsibleStates[key] !== false;
      }

      function setCollapsibleOpen(key, open) {
        collapsibleStates[key] = Boolean(open);
      }

      function currentScrollTop() {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }

      function setInteractionScrollAnchor() {
        pendingInteractionScrollTop = currentScrollTop();
      }

      function consumeInteractionScrollAnchor() {
        const anchor = pendingInteractionScrollTop;
        pendingInteractionScrollTop = null;
        return typeof anchor === "number" ? anchor : null;
      }

      function rememberCurrentTabScroll() {
        if (!selectedTab) {
          return;
        }
        tabScrollPositions[selectedTab] = currentScrollTop();
      }

      function restoreSelectedTabScroll() {
        if (!selectedTab) {
          return;
        }
        const target = Math.max(0, Number(tabScrollPositions[selectedTab]) || 0);
        if (scrollRestoreHandle) {
          cancelAnimationFrame(scrollRestoreHandle);
        }
        scrollRestoreHandle = requestAnimationFrame(() => {
          scrollRestoreHandle = null;
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo(0, Math.min(target, maxScroll));
        });
      }

      function switchTab(nextTab) {
        if (!nextTab || selectedTab === nextTab) {
          return;
        }
        rememberCurrentTabScroll();
        selectedTab = nextTab;
      }

      function switchSettingsTab(nextTab) {
        if (!nextTab || !(nextTab in settingsTabLabels)) {
          return;
        }
        settingsModalTab = nextTab;
      }

      function openSettingsModal(nextTab) {
        settingsModalOpen = true;
        switchSettingsTab(nextTab || settingsModalTab || "providers");
      }

      function closeModal() {
        profileDocumentPreview = null;
        settingsModalOpen = false;
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
          case "researcher":
            return "리서처";
          case "coordinator":
            return "코디네이터";
          case "drafter":
            return "드래프터";
          case "finalizer":
            return "파이널라이저";
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

      function roleCountLabel(count) {
        return \`역할 \${count}개\`;
      }

      function runIterationLabel(run) {
        const unit = normalizeReviewMode(run.reviewMode) === "realtime" ? "라운드" : "사이클";
        return \`\${run.rounds} \${unit}\`;
      }

      function defaultRunRoleProviderId(roleKey, healthyProviders) {
        const providerIds = healthyProviders.map((provider) => provider.providerId);
        const primary = providerIds[0] || "";
        const secondary = providerIds[1] || primary;
        const tertiary = providerIds[2] || secondary || primary;

        switch (roleKey) {
          case "context_researcher":
            return primary;
          case "section_coordinator":
            return primary;
          case "section_drafter":
            return secondary;
          case "fit_reviewer":
            return primary;
          case "evidence_reviewer":
            return secondary;
          case "voice_reviewer":
            return tertiary;
          case "finalizer":
            return secondary;
          default:
            return primary;
        }
      }

      function normalizeRoleEffort(value) {
        return String(value || "").trim();
      }

      function normalizeRunRoleAssignment(raw, healthyProviders, fallbackProviderId) {
        const healthyIds = new Set(healthyProviders.map((provider) => provider.providerId));
        const roleKey = String(raw?.roleKey || raw?.role || "").trim();
        const providerId = String(raw?.providerId || "").trim();
        const sanitizedProviderId = healthyIds.size === 0
          ? providerId || fallbackProviderId || ""
          : (healthyIds.has(providerId) ? providerId : fallbackProviderId || healthyProviders[0]?.providerId || "");
        const modelOverride = String(raw?.modelOverride || "").trim();
        const effortOverride = normalizeRoleEffort(String(raw?.effortOverride || "").trim());
        const useProviderDefaults = typeof raw?.useProviderDefaults === "boolean"
          ? raw.useProviderDefaults
          : !(modelOverride || effortOverride);

        return {
          roleKey,
          providerId: sanitizedProviderId,
          modelOverride,
          effortOverride,
          useProviderDefaults
        };
      }

      function defaultRunRoleAssignments(healthyProviders) {
        return runRoleOrder.map((roleKey) => {
          const providerId = defaultRunRoleProviderId(roleKey, healthyProviders);
          return {
            roleKey,
            providerId,
            modelOverride: "",
            effortOverride: "",
            useProviderDefaults: true
          };
        });
      }

      function normalizeRunRoleAssignments(rawAssignments, healthyProviders) {
        const defaults = defaultRunRoleAssignments(healthyProviders);
        const rawMap = new Map();
        if (Array.isArray(rawAssignments)) {
          for (const assignment of rawAssignments) {
            const roleKey = String(assignment?.roleKey || assignment?.role || "").trim();
            if (assignment && typeof assignment === "object" && roleKey) {
              rawMap.set(roleKey, assignment);
            }
          }
        }

        return runRoleOrder.map((roleKey) => {
          const base = defaults.find((assignment) => assignment.roleKey === roleKey) || {
            roleKey,
            providerId: "",
            modelOverride: "",
            effortOverride: "",
            useProviderDefaults: true
          };
          return normalizeRunRoleAssignment(rawMap.get(roleKey) || base, healthyProviders, base.providerId);
        });
      }

      function buildContinuationRunRoleAssignments(continuation, healthyProviders) {
        if (Array.isArray(continuation?.roleAssignments) && continuation.roleAssignments.length > 0) {
          return normalizeRunRoleAssignments(continuation.roleAssignments, healthyProviders);
        }

        const coordinatorProvider = continuation?.coordinatorProvider || "";
        const reviewerProviders = Array.isArray(continuation?.reviewerProviders) ? continuation.reviewerProviders : [];
        const derivedAssignments = [
          { roleKey: "context_researcher", providerId: coordinatorProvider },
          { roleKey: "section_coordinator", providerId: coordinatorProvider },
          { roleKey: "section_drafter", providerId: reviewerProviders[0] || coordinatorProvider },
          { roleKey: "fit_reviewer", providerId: reviewerProviders[0] || coordinatorProvider },
          { roleKey: "evidence_reviewer", providerId: reviewerProviders[1] || reviewerProviders[0] || coordinatorProvider },
          { roleKey: "voice_reviewer", providerId: reviewerProviders[2] || reviewerProviders[1] || reviewerProviders[0] || coordinatorProvider },
          { roleKey: "finalizer", providerId: reviewerProviders[0] || coordinatorProvider }
        ];

        return normalizeRunRoleAssignments(derivedAssignments, healthyProviders);
      }

      function buildLegacyRunRoleAssignments(healthyProviders) {
        const coordinatorProvider = runCoordinatorSelection || "";
        const reviewerProviders = Array.isArray(runReviewerSelections) ? runReviewerSelections : [];
        const derivedAssignments = [
          { roleKey: "context_researcher", providerId: coordinatorProvider },
          { roleKey: "section_coordinator", providerId: coordinatorProvider },
          { roleKey: "section_drafter", providerId: reviewerProviders[0] || coordinatorProvider },
          { roleKey: "fit_reviewer", providerId: reviewerProviders[0] || coordinatorProvider },
          { roleKey: "evidence_reviewer", providerId: reviewerProviders[1] || reviewerProviders[0] || coordinatorProvider },
          { roleKey: "voice_reviewer", providerId: reviewerProviders[2] || reviewerProviders[1] || reviewerProviders[0] || coordinatorProvider },
          { roleKey: "finalizer", providerId: reviewerProviders[0] || coordinatorProvider }
        ];

        return normalizeRunRoleAssignments(derivedAssignments, healthyProviders);
      }

      function runRoleAssignmentByKey(roleKey) {
        return runRoleAssignments.find((assignment) => assignment.roleKey === roleKey) || null;
      }

      function updateRunRoleAssignment(roleKey, updates) {
        runRoleAssignments = runRoleAssignments.map((assignment) => {
          if (assignment.roleKey !== roleKey) {
            return assignment;
          }
          return {
            ...assignment,
            ...updates
          };
        });
        syncLegacyRunSelectionsFromRoles();
      }

      function syncLegacyRunSelectionsFromRoles() {
        const coordinatorAssignment = runRoleAssignmentByKey("section_coordinator");
        runCoordinatorSelection = coordinatorAssignment?.providerId || null;
        runReviewerSelections = runReviewerRoleKeys
          .map((roleKey) => runRoleAssignmentByKey(roleKey)?.providerId || "")
          .filter(Boolean);
      }

      function providerLabel(providerId) {
        return providerLabels[providerId] || providerId || "없음";
      }

      function providerConfiguredModelLabel(providerId) {
        const provider = (appState?.providers || []).find((item) => item.providerId === providerId);
        if (!provider) {
          return "";
        }

        const selectedModel = providerCustomModels[providerId] || provider.configuredModel || "";
        const selectedEffort = provider.configuredEffort || "";
        const pieces = [];
        if (selectedModel) {
          pieces.push(selectedModel);
        }
        if (selectedEffort) {
          pieces.push(selectedEffort);
        }
        return pieces.join(" · ");
      }

      function roleOverrideSummary(roleAssignment) {
        if (!roleAssignment) {
          return "";
        }

        if (roleAssignment.useProviderDefaults) {
          return "기본값 상속";
        }

        const pieces = [];
        if (roleAssignment.modelOverride) {
          pieces.push(\`모델 \${roleAssignment.modelOverride}\`);
        }
        if (roleAssignment.effortOverride) {
          pieces.push(\`effort \${roleAssignment.effortOverride}\`);
        }
        return pieces.length > 0 ? pieces.join(" · ") : "기본값 상속";
      }

      function roleAssignmentStatusLabel(roleAssignment) {
        const summary = providerConfiguredModelLabel(roleAssignment?.providerId);
        return summary ? \`\${providerLabel(roleAssignment?.providerId)} · \${summary}\` : providerLabel(roleAssignment?.providerId);
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

      function reportClientError(error, phase) {
        const message = error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : String(error ?? "알 수 없는 웹뷰 오류");
        const stack = error instanceof Error && error.stack ? String(error.stack) : undefined;
        post({
          type: "webviewClientError",
          source: "sidebar",
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
          liveDiscussionLedger,
          runContinuation,
          projectDocumentEditor,
          awaitingIntervention,
          providerModelSelections,
          providerCustomModels,
          selectedReviewMode,
          runRoleAssignments,
          runRoleAdvancedOpen,
          runCoordinatorSelection,
          runReviewerSelections,
          runFormState,
          settingsModalOpen,
          settingsModalTab,
          collapsibleStates,
          tabScrollPositions,
          bannerQueue,
          activeTurnStates
        });
      }

      function selectedProject() {
        return appState?.projects?.find((project) => project.record.slug === selectedProjectSlug) || null;
      }

      function projectInsightStatusMeta(project) {
        const status = project?.record?.insightStatus || "idle";
        switch (status) {
          case "ready":
            return {
              label: "인사이트 준비됨",
              className: "ok",
              description: "생성된 인사이트 문서가 이후 실행에 기본 포함됩니다."
            };
          case "reviewNeeded":
            return {
              label: "검토 필요",
              className: "",
              description: "자동 추출 결과를 확인하거나 OpenDART 후보를 선택한 뒤 다시 생성하세요."
            };
          case "generating":
            return {
              label: "생성 중",
              className: "",
              description: "공고와 회사 정보를 바탕으로 인사이트 문서를 만드는 중입니다."
            };
          case "error":
            return {
              label: "오류",
              className: "bad",
              description: project?.record?.insightLastError || "인사이트 생성 중 오류가 발생했습니다."
            };
          default:
            return {
              label: "미분석",
              className: "",
              description: "공고를 분석하면 구조화된 필드와 인사이트 문서를 만들 수 있습니다."
            };
        }
      }

      function formatTimestamp(value) {
        if (!value) {
          return "";
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return String(value);
        }

        return parsed.toLocaleString();
      }

      function joinLines(values) {
        return Array.isArray(values) && values.length > 0 ? values.join("\n") : "";
      }

      function joinKeywords(values) {
        return Array.isArray(values) && values.length > 0 ? values.join(", ") : "";
      }

      function parseKeywordList(value) {
        return dedupeStrings(String(value || "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean));
      }

      function dedupeStrings(values) {
        const seen = new Set();
        const next = [];
        for (const value of values) {
          if (!value || seen.has(value)) {
            continue;
          }
          seen.add(value);
          next.push(value);
        }
        return next;
      }

      function readProjectInsightFormPayload(form, project) {
        const data = new FormData(form);
        const openDartCorpCode = data.has("openDartCorpCode")
          ? data.get("openDartCorpCode")?.toString() || ""
          : project?.record?.openDartCorpCode || "";

        return {
          companyName: data.get("companyName")?.toString() || "",
          roleName: data.get("roleName")?.toString() || "",
          mainResponsibilities: data.get("mainResponsibilities")?.toString() || "",
          qualifications: data.get("qualifications")?.toString() || "",
          preferredQualifications: data.get("preferredQualifications")?.toString() || "",
          keywords: parseKeywordList(data.get("keywords")?.toString() || ""),
          jobPostingUrl: data.get("jobPostingUrl")?.toString() || "",
          jobPostingText: data.get("jobPostingText")?.toString() || "",
          essayQuestions: readQuestionFieldValues(data),
          openDartCorpCode
        };
      }

      function healthyRunProviders() {
        return (appState?.providers || []).filter((provider) => provider.installed && provider.authStatus === "healthy");
      }

      function syncRunProviderSelections(healthyProviders) {
        if (healthyProviders.length === 0) {
          runRoleAssignments = normalizeRunRoleAssignments(runRoleAssignments, healthyProviders);
          syncLegacyRunSelectionsFromRoles();
          return;
        }

        const hasRoleAssignments = Array.isArray(runRoleAssignments) && runRoleAssignments.length > 0;
        const sourceAssignments = hasRoleAssignments
          ? runRoleAssignments
          : (runContinuation
            ? buildContinuationRunRoleAssignments(runContinuation, healthyProviders)
            : ((runCoordinatorSelection || runReviewerSelections.length > 0)
              ? buildLegacyRunRoleAssignments(healthyProviders)
              : defaultRunRoleAssignments(healthyProviders)));
        runRoleAssignments = normalizeRunRoleAssignments(sourceAssignments, healthyProviders);
        syncLegacyRunSelectionsFromRoles();
      }

      function applyChatEvent(event) {
        const messageId = event.messageId;
        if (!messageId) {
          return;
        }

        if (event.type === "chat-message-started" && isNotionPrepassMessage(event)) {
          collapseResearcherPrePass(event.providerId, messageId);
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

      function isNotionPrepassMessage(message) {
        return message?.round === 0 && (
          message?.participantId === "context-researcher" ||
          message?.speakerRole === "researcher"
        );
      }

      function collapseResearcherPrePass(providerId, currentMessageId) {
        const removedIds = runChatMessages
          .filter((message) => (
            message.id !== currentMessageId &&
            message.providerId === providerId &&
            isNotionPrepassMessage(message)
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
