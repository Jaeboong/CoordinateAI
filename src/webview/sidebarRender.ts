export const renderSource = String.raw`
      function render() {
        renderBanner();
        renderTabs();
        renderContent();
        renderModal();
        renderChatLog();
        renderDiscussionLedgerSummary();
        renderActivityRow();
        renderConversationComposer();
        renderSystemLog();
        restoreSelectedTabScroll();
      }

      function rerenderView(anchorScrollTop) {
        if (selectedTab) {
          tabScrollPositions[selectedTab] = typeof anchorScrollTop === "number"
            ? anchorScrollTop
            : currentScrollTop();
        }
        render();
        persistState();
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
        el.innerHTML = \`
          <div class="tab-strip">
            <div class="tab-list">
              \${Object.entries(tabLabels)
                .map(([key, label]) => \`<button class="tab \${selectedTab === key ? "active" : ""}" data-action="switch-tab" data-tab="\${key}">\${label}</button>\`)
                .join("")}
            </div>
            <div class="tabs-actions">
              <button class="tab settings-tab" type="button" data-action="open-settings">설정</button>
            </div>
          </div>
        \`;
      }

      function renderContent() {
        const el = document.getElementById("content");
        if (!appState?.workspaceOpened) {
          el.innerHTML = '<div class="card">ForJob는 모든 프로필, 프로젝트, 실행 결과를 워크스페이스 내부에 저장하므로 워크스페이스 폴더가 필요합니다.</div>';
          return;
        }

        if (selectedTab === "projects") {
          el.innerHTML = renderProjects();
        } else {
          el.innerHTML = renderRuns();
        }
      }

      function renderModal() {
        const el = document.getElementById("modal-root");
        if (!el) {
          return;
        }

        const preview = profileDocumentPreview;
        if (!preview && !settingsModalOpen) {
          document.body.classList.remove("modal-open");
          el.innerHTML = "";
          return;
        }

        document.body.classList.add("modal-open");
        if (preview) {
        const previewSourceLabel = preview.previewSource === "normalized"
          ? "정규화 텍스트"
          : preview.previewSource === "raw"
            ? "원본 텍스트"
            : "미리보기 없음";

        el.innerHTML = \`
          <div class="modal-backdrop" data-action="close-profile-document-preview">
            <section class="modal-dialog profile-preview-modal" role="dialog" aria-modal="true" aria-labelledby="profile-preview-title">
              <div class="modal-header">
                <div class="stack" style="gap:4px;">
                  <strong id="profile-preview-title">\${escapeHtml(preview.title)}</strong>
                  <div class="muted small">\${escapeHtml(preview.sourceType)} • \${escapeHtml(preview.extractionStatus)} • \${escapeHtml(previewSourceLabel)}</div>
                </div>
                <button class="button secondary modal-close-button" type="button" data-action="close-profile-document-preview" aria-label="미리보기 닫기">닫기</button>
              </div>
              <div class="modal-body stack">
                \${preview.note ? \`<div class="card"><strong>메모</strong><div class="small">\${escapeHtml(preview.note)}</div></div>\` : ""}
                <div class="card stack">
                  <strong>파일 정보</strong>
                  <div class="small"><span class="muted">원본:</span> \${escapeHtml(preview.rawPath)}</div>
                  <div class="small"><span class="muted">정규화:</span> \${escapeHtml(preview.normalizedPath || "없음")}</div>
                </div>
                <div class="card stack">
                  <strong>본문 미리보기</strong>
                  \${preview.previewSource === "none"
                    ? '<div class="muted small preview-empty">미리보기 가능한 텍스트가 없습니다.</div>'
                    : \`<pre class="preview-content">\${escapeHtml(preview.content)}</pre>\`}
                </div>
              </div>
            </section>
          </div>
        \`;
          return;
        }

        el.innerHTML = \`
          <div class="modal-backdrop" data-action="close-settings-modal">
            <section class="modal-dialog settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
              <div class="modal-header">
                <div class="stack" style="gap:4px;">
                  <strong id="settings-modal-title">설정</strong>
                  <div class="muted small">AI 도구, OpenDART, 프로필 문서를 이곳에서 관리합니다.</div>
                </div>
                <button class="button secondary modal-close-button" type="button" data-action="close-settings-modal" aria-label="설정 닫기">닫기</button>
              </div>
              <div class="modal-body stack">
                <div class="settings-tabs">
                  \${Object.entries(settingsTabLabels)
                    .map(([key, label]) => \`<button class="tab \${settingsModalTab === key ? "active" : ""}" type="button" data-action="switch-settings-tab" data-settings-tab="\${key}">\${label}</button>\`)
                    .join("")}
                </div>
                <div class="settings-panel">
                  \${settingsModalTab === "providers"
                    ? renderProviders()
                    : settingsModalTab === "openDart"
                      ? renderOpenDartSettings()
                      : renderProfile()}
                </div>
              </div>
            </section>
          </div>
        \`;
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

      function renderDiscussionLedgerSummary() {
        const el = document.getElementById("discussion-ledger-summary");
        if (!el) {
          return;
        }

        const activeRealtime =
          appState?.runState?.status !== "idle" &&
          appState?.runState?.reviewMode === "realtime" &&
          appState?.runState?.projectSlug === selectedProjectSlug;
        if (!activeRealtime || !liveDiscussionLedger) {
          el.innerHTML = "";
          el.hidden = true;
          return;
        }

        const challenges = Array.isArray(liveDiscussionLedger.openChallenges) ? liveDiscussionLedger.openChallenges : [];
        const deferredChallenges = Array.isArray(liveDiscussionLedger.deferredChallenges) ? liveDiscussionLedger.deferredChallenges : [];
        el.hidden = false;
        el.innerHTML = \`
          <div class="discussion-ledger-summary">
            <div class="row space">
              <strong>실시간 ledger</strong>
              <span class="chip">\${escapeHtml(liveDiscussionLedger.targetSection || "대상 구간 없음")}</span>
            </div>
            <div class="discussion-ledger-grid">
              <section class="discussion-ledger-block">
                <div class="discussion-ledger-label">현재 초점</div>
                <div class="discussion-ledger-value">\${renderMarkdown(liveDiscussionLedger.currentFocus || "")}</div>
              </section>
              <section class="discussion-ledger-block">
                <div class="discussion-ledger-label">미니 초안</div>
                <div class="discussion-ledger-value">\${renderMarkdown(liveDiscussionLedger.miniDraft || "")}</div>
              </section>
            </div>
            <section class="discussion-ledger-block">
              <div class="discussion-ledger-label">남은 쟁점</div>
              \${challenges.length > 0
                ? \`<ul class="discussion-ledger-list">\${challenges.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul>\`
                : '<div class="muted small">남은 쟁점이 없습니다.</div>'}
            </section>
            <section class="discussion-ledger-block">
              <div class="discussion-ledger-label">후속 과제</div>
              \${deferredChallenges.length > 0
                ? \`<ul class="discussion-ledger-list">\${deferredChallenges.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul>\`
                : '<div class="muted small">후속 과제가 없습니다.</div>'}
            </section>
          </div>
        \`;
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
                placeholder="\${paused ? "비워두면 계속 진행합니다. 종료가 필요하면 /done도 사용할 수 있습니다" : "대화에 메시지를 보내세요"}"
              ></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">\${escapeHtml(
                  paused
                    ? (appState?.runState?.message || "대화가 일시정지되었습니다. 메시지를 보내거나, 비워둔 채 계속 진행할 수 있습니다. 종료가 꼭 필요할 때만 /done을 사용하세요.")
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

        if (runStatus === "paused" && awaitingIntervention) {
          el.innerHTML = \`
            <form id="round-intervention-form" class="conversation-composer">
              <textarea
                id="round-intervention-input"
                name="message"
                placeholder="비워둔 채 Enter를 누르면 계속 진행합니다. 종료가 필요하면 /done도 사용할 수 있습니다"
              ></textarea>
              <div class="conversation-composer-footer">
                <div class="muted small conversation-composer-hint">\${escapeHtml(awaitingIntervention.message || "사이클이 끝났습니다. Enter로 계속 진행하거나, 다음 사이클 메모를 남기세요. 문항 완료는 Essay 탭의 완료 버튼으로 처리하고, /done은 필요할 때만 사용하세요.")}</div>
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
