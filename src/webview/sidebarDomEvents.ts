export const domEventSource = String.raw`
      window.addEventListener("scroll", () => {
        rememberCurrentTabScroll();
      }, { passive: true });

      document.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element ? event.target.closest("select, input[type='checkbox'], [data-action='toggle-collapsible'], [data-action='toggle-run-role-advanced']") : null;
        if (!target) {
          return;
        }
        setInteractionScrollAnchor();
      }, { passive: true });

      document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target) {
          return;
        }

        const action = target.dataset.action;
        if (action === "switch-tab") {
          switchTab(target.dataset.tab);
          render();
          persistState();
          return;
        }
        if (action === "open-settings") {
          openSettingsModal(target.dataset.settingsTab || "providers");
          render();
          persistState();
          return;
        }
        if (action === "close-settings-modal") {
          settingsModalOpen = false;
          renderModal();
          persistState();
          return;
        }
        if (action === "switch-settings-tab") {
          switchSettingsTab(target.dataset.settingsTab || "providers");
          renderModal();
          persistState();
          return;
        }
        if (action === "toggle-collapsible") {
          const key = target.dataset.key;
          if (!key || !(key in defaultCollapsibleStates)) {
            return;
          }
          setCollapsibleOpen(key, !isCollapsibleOpen(key));
          rerenderView(consumeInteractionScrollAnchor());
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
        if (action === "open-profile-document-preview") {
          markPending(target);
          post({ type: "openProfileDocumentPreview", documentId: target.dataset.documentId });
          return;
        }
        if (action === "close-profile-document-preview") {
          profileDocumentPreview = null;
          renderModal();
          return;
        }
        if (action === "clear-api-key") {
          markPending(target);
          post({ type: "clearApiKey", providerId: target.dataset.provider });
          return;
        }
        if (action === "save-open-dart-api-key") {
          const input = document.getElementById("open-dart-api-key");
          markPending(target);
          post({
            type: "saveOpenDartApiKey",
            apiKey: input?.value || ""
          });
          if (input) {
            input.value = "";
          }
          return;
        }
        if (action === "clear-open-dart-api-key") {
          markPending(target);
          post({ type: "clearOpenDartApiKey" });
          const input = document.getElementById("open-dart-api-key");
          if (input) {
            input.value = "";
          }
          return;
        }
        if (action === "test-open-dart-connection") {
          markPending(target);
          post({ type: "testOpenDartConnection" });
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
        if (action === "add-essay-question") {
          const container = document.getElementById(target.dataset.target || "");
          const nextField = appendEssayQuestionField(container, "");
          nextField?.focus();
          return;
        }
        if (action === "select-project") {
          selectedProjectSlug = target.dataset.projectSlug;
          if (projectDocumentEditor && projectDocumentEditor.projectSlug !== selectedProjectSlug) {
            projectDocumentEditor = null;
          }
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "delete-project") {
          markPending(target);
          post({ type: "deleteProject", projectSlug: selectedProjectSlug });
          return;
        }
        if (action === "analyze-project-insights" || action === "generate-project-insights") {
          const form = document.getElementById("project-info-form");
          const project = selectedProject();
          if (!(form instanceof HTMLFormElement) || !project) {
            pushBanner({ kind: "error", message: "프로젝트 정보를 먼저 입력한 뒤 다시 시도하세요." });
            renderBanner();
            return;
          }
          markPending(target);
          post({
            type: action === "analyze-project-insights" ? "analyzeProjectInsights" : "generateProjectInsights",
            projectSlug: project.record.slug,
            ...readProjectInsightFormPayload(form, project)
          });
          return;
        }
        if (action === "open-insight-workspace") {
          const project = selectedProject();
          if (!project) {
            return;
          }
          markPending(target);
          post({ type: "openInsightWorkspace", projectSlug: project.record.slug });
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
            rerenderView();
          }
          return;
        }
        if (action === "clear-project-document-editor") {
          projectDocumentEditor = null;
          rerenderView();
          return;
        }
        if (action === "run-review") {
          markPending(target);
          submitRunForm();
          return;
        }
        if (action === "set-active-question") {
          const project = selectedProject();
          if (!project) {
            return;
          }
          setActiveQuestionIndex(project, Number(target.dataset.questionIndex));
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "complete-essay-question") {
          const project = selectedProject();
          if (!project) {
            return;
          }
          const answer = activeQuestionDraft(project).trim();
          if (!answer) {
            pushBanner({ kind: "error", message: "완료하려면 현재 문항의 답안을 먼저 입력하세요." });
            renderBanner();
            return;
          }
          const questionIndex = activeQuestionIndex(project);
          const question = activeQuestionText(project);
          const latestQuestionRun = (project.runs || []).find((run) => (
            (run.record.projectQuestionIndex ?? 0) === questionIndex &&
            run.record.question === question
          ));
          markPending(target);
          post({
            type: "completeEssayQuestion",
            projectSlug: project.record.slug,
            questionIndex,
            question,
            answer,
            runId: latestQuestionRun?.record?.id || ""
          });
          advanceToNextQuestion(project);
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "toggle-run-role-advanced") {
          runRoleAdvancedOpen = !runRoleAdvancedOpen;
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "toggle-run-extra-doc") {
          const documentId = target.dataset.documentId;
          if (!documentId) {
            return;
          }
          const project = selectedProject();
          if (!project) {
            return;
          }
          const formState = projectRunFormState(project);
          const current = new Set(formState.selectedDocumentIds || []);
          if (current.has(documentId)) {
            current.delete(documentId);
          } else {
            current.add(documentId);
          }
          updateProjectRunFormState(project, {
            selectedDocumentIds: [...current]
          });
          rerenderView(consumeInteractionScrollAnchor());
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
          runRoleAssignments = [];
          syncRunProviderSelections(healthyRunProviders());
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "reset-run-form") {
          resetRunFormState(selectedProject(), projectExtraRunDocuments(selectedProject()));
          setCollapsibleOpen("runSetup", true);
          rerenderView(consumeInteractionScrollAnchor());
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
            rerenderView(consumeInteractionScrollAnchor());
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
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "set-run-role-provider") {
          const roleKey = target.dataset.roleKey;
          if (!roleKey) {
            return;
          }
          updateRunRoleAssignment(roleKey, {
            providerId: target.value || ""
          });
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "toggle-run-role-defaults") {
          const roleKey = target.dataset.roleKey;
          if (!roleKey) {
            return;
          }
          updateRunRoleAssignment(roleKey, {
            useProviderDefaults: target.checked
          });
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "set-run-role-model") {
          const roleKey = target.dataset.roleKey;
          if (!roleKey) {
            return;
          }
          const currentAssignment = runRoleAssignmentByKey(roleKey);
          const nextModelOverride = target.value || "";
          updateRunRoleAssignment(roleKey, {
            modelOverride: nextModelOverride,
            useProviderDefaults: !(nextModelOverride || currentAssignment?.effortOverride)
          });
          rerenderView(consumeInteractionScrollAnchor());
          return;
        }
        if (action === "set-run-role-effort") {
          const roleKey = target.dataset.roleKey;
          if (!roleKey) {
            return;
          }
          const currentAssignment = runRoleAssignmentByKey(roleKey);
          const nextEffortOverride = target.value || "";
          updateRunRoleAssignment(roleKey, {
            effortOverride: nextEffortOverride,
            useProviderDefaults: !(currentAssignment?.modelOverride || nextEffortOverride)
          });
          rerenderView(consumeInteractionScrollAnchor());
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
          if (selectedProject()) {
            projectRunFormState(selectedProject());
          }
          rerenderView(consumeInteractionScrollAnchor());
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
        const project = selectedProject();
        if (target.id === "run-draft") {
          if (project) {
            updateActiveQuestionDraft(project, target.value);
            persistState();
          }
          return;
        }
        if (target.id === "run-notion-request") {
          if (project) {
            updateProjectRunFormState(project, {
              notionRequest: target.value
            });
            persistState();
          }
          return;
        }
        if (target.id === "run-continuation-note") {
          if (project) {
            updateProjectRunFormState(project, {
              continuationNote: target.value
            });
            persistState();
          }
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && profileDocumentPreview) {
          profileDocumentPreview = null;
          renderModal();
          event.preventDefault();
          return;
        }

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
          const payload = readProjectInsightFormPayload(form);
          post({
            type: "createProject",
            ...payload
          });
          form.reset();
          const questionList = document.getElementById("project-create-questions");
          if (questionList) {
            questionList.innerHTML = renderEssayQuestionFields([""]);
          }
          setCollapsibleOpen("projectCreate", false);
          persistState();
        }

        if (form.id === "project-info-form") {
          markPending(event.submitter);
          const payload = readProjectInsightFormPayload(form, selectedProject());
          post({
            type: "updateProjectInfo",
            projectSlug: selectedProjectSlug,
            ...payload
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
          rerenderView();
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

        const healthyProviders = healthyRunProviders();
        syncRunProviderSelections(healthyProviders);
        const formState = projectRunFormState(project);
        const question = activeQuestionText(project);
        if (!question) {
          pushBanner({ kind: "error", message: "Essay 탭에서 실행하려면 프로젝트에 저장된 문항이 필요합니다." });
          renderBanner();
          return;
        }
        const healthyIds = new Set(healthyProviders.map((provider) => provider.providerId));
        const roleAssignments = runRoleOrder.map((roleKey) => runRoleAssignmentByKey(roleKey) || defaultRunRoleAssignments(healthyProviders).find((assignment) => assignment.roleKey === roleKey));
        const missingRole = roleAssignments.find((assignment) => !assignment?.providerId || !healthyIds.has(assignment.providerId));
        if (missingRole) {
          pushBanner({ kind: "error", message: "7개 역할 모두 정상 상태의 provider를 1명씩 선택하세요." });
          renderBanner();
          return;
        }

        const coordinatorProvider = runRoleAssignmentByKey("section_coordinator")?.providerId || "";
        const reviewerProviders = runReviewerRoleKeys
          .map((roleKey) => runRoleAssignmentByKey(roleKey)?.providerId || "")
          .filter(Boolean);

        rememberCurrentTabScroll();
        syncLegacyRunSelectionsFromRoles();
        setCollapsibleOpen("runSetup", false);

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
          projectQuestionIndex: activeQuestionIndex(project),
          question,
          draft: formState?.questionStates?.[activeQuestionIndex(project)]?.draft || document.getElementById("run-draft").value,
          reviewMode: currentReviewMode(),
          notionRequest: formState?.notionRequest || document.getElementById("run-notion-request").value,
          continuationFromRunId: runContinuation?.runId || "",
          continuationNote: formState?.continuationNote || document.getElementById("run-continuation-note")?.value || "",
          rounds: 1,
          coordinatorProvider,
          reviewerProviders,
          roleAssignments: runRoleOrder.map((roleKey) => {
            const assignment = runRoleAssignmentByKey(roleKey) || defaultRunRoleAssignments(healthyProviders).find((item) => item.roleKey === roleKey) || {
              roleKey,
              providerId: "",
              modelOverride: "",
              effortOverride: "",
              useProviderDefaults: true
            };
            return {
              role: assignment.roleKey,
              providerId: assignment.providerId,
              modelOverride: assignment.useProviderDefaults ? "" : (assignment.modelOverride || ""),
              effortOverride: assignment.useProviderDefaults ? "" : (assignment.effortOverride || ""),
              useProviderDefaults: Boolean(assignment.useProviderDefaults)
            };
          }),
          selectedDocumentIds: [...(formState?.selectedDocumentIds || [])]
        });
      }
`;
