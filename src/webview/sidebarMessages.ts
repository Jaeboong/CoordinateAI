export const messageHandlingSource = String.raw`
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.type === "state") {
          appState = message.payload;
          syncProviderSettingsState();
          if (!(selectedTab in tabLabels)) {
            selectedTab = "projects";
          }
          if (!(settingsModalTab in settingsTabLabels)) {
            settingsModalTab = "providers";
          }
          selectedReviewMode = normalizeReviewMode(selectedReviewMode || runContinuation?.reviewMode || appState?.preferences?.lastReviewMode);
          const projects = appState.projects || [];
          if (!selectedProjectSlug || !projects.some((project) => project.record.slug === selectedProjectSlug)) {
            selectedProjectSlug = projects[0]?.record.slug || null;
          }
          if (runContinuation && runContinuation.projectSlug !== selectedProjectSlug) {
            runContinuation = null;
          }
          if (appState?.runState?.status === "idle") {
            liveDiscussionLedger = null;
            awaitingIntervention = null;
          }
          if (projectDocumentEditor && projectDocumentEditor.projectSlug !== selectedProjectSlug) {
            projectDocumentEditor = null;
          }
          if (selectedProject()) {
            projectRunFormState(selectedProject());
          }
          if (!appState?.busyMessage && appState?.runState?.status === "idle") {
            clearPendingFeedback();
          }
          render();
          persistState();
        } else if (message.type === "continuationPreset") {
          runContinuation = message.payload;
          selectedReviewMode = normalizeReviewMode(runContinuation?.reviewMode);
          runRoleAssignments = buildContinuationRunRoleAssignments(runContinuation, healthyRunProviders());
          runRoleAdvancedOpen = false;
          setCollapsibleOpen("runSetup", true);
          selectedProjectSlug = runContinuation?.projectSlug || selectedProjectSlug;
          applyRunContinuationToProjectState(runContinuation);
          switchTab("runs");
          render();
          persistState();
        } else if (message.type === "projectDocumentEditorPreset") {
          projectDocumentEditor = message.payload;
          selectedProjectSlug = projectDocumentEditor?.projectSlug || selectedProjectSlug;
          switchTab("projects");
          render();
          persistState();
        } else if (message.type === "profileDocumentPreview") {
          profileDocumentPreview = message.payload;
          settingsModalOpen = true;
          settingsModalTab = "profile";
          clearPendingFeedback();
          render();
        } else if (message.type === "runEvent") {
          const payload = message.payload;
          if (payload.type === "run-started") {
            liveDiscussionLedger = null;
          }
          if (payload.type === "discussion-ledger-updated") {
            liveDiscussionLedger = payload.discussionLedger || null;
            renderDiscussionLedgerSummary();
          }
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
          renderDiscussionLedgerSummary();
          persistState();
        } else if (message.type === "banner") {
          pushBanner(message.payload);
          clearPendingFeedback();
          renderBanner();
        }
      });
`;
