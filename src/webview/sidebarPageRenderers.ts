export const pageRendererSource = String.raw`
      function renderProjectFold(key, title, body) {
        const open = isCollapsibleOpen(key);
        return \`
          <section class="project-fold collapsible-shell \${open ? "open" : ""}">
            <button
              class="project-fold-summary collapsible-toggle"
              type="button"
              data-action="toggle-collapsible"
              data-key="\${key}"
              aria-expanded="\${open ? "true" : "false"}">
              <span class="project-fold-title">\${escapeHtml(title)}</span>
              <span class="project-fold-meta">
                <span class="project-fold-state project-fold-state-open">열림</span>
                <span class="project-fold-state project-fold-state-closed">접힘</span>
                <span class="project-fold-chevron collapsible-chevron" aria-hidden="true">⌄</span>
              </span>
            </button>
            <div class="collapsible-panel">
              <div class="collapsible-panel-inner">
                <div class="project-fold-body stack">\${body}</div>
              </div>
            </div>
          </section>
        \`;
      }

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

      function renderOpenDartSettings() {
        const status = appState?.openDartConnectionStatus || "untested";
        const statusClass = status === "healthy" ? "ok" : status === "unhealthy" || status === "missing" ? "bad" : "";
        const statusLabel = status === "healthy"
          ? "정상"
          : status === "missing"
            ? "미설정"
            : status === "unhealthy"
              ? "문제"
              : "미확인";

        return \`
          <div class="stack">
            <div class="card">
              <div class="row space">
                <div>
                  <strong>OpenDART</strong>
                  <div class="muted small">공식 OpenDART REST API를 사용해 기업 개황과 재무 정보를 보강합니다.</div>
                </div>
                <span class="chip \${appState?.openDartConfigured ? "ok" : "bad"}">\${appState?.openDartConfigured ? "API 키 저장됨" : "API 키 없음"}</span>
              </div>
              <label>
                API 키
                <input id="open-dart-api-key" type="password" placeholder="\${appState?.openDartConfigured ? "저장된 키는 숨겨집니다" : "OpenDART API 키를 붙여넣으세요"}" />
              </label>
              <div class="actions">
                <button class="button" type="button" data-action="save-open-dart-api-key">저장</button>
                <button class="button secondary" type="button" data-action="test-open-dart-connection">연결 확인</button>
                <button class="button secondary" type="button" data-action="clear-open-dart-api-key">키 지우기</button>
              </div>
            </div>
            <div class="card">
              <div class="row space">
                <div>
                  <strong>연결 상태</strong>
                  <div class="muted small">연결 확인 버튼을 눌러 실제 요청이 성공하는지 검사합니다.</div>
                </div>
                <span class="chip \${statusClass}">\${statusLabel}</span>
              </div>
              <div class="grid two">
                <div class="stack">
                  <div class="muted small">마지막 확인</div>
                  <div>\${escapeHtml(formatTimestamp(appState?.openDartLastCheckAt) || "아직 없음")}</div>
                </div>
                <div class="stack">
                  <div class="muted small">상태 메모</div>
                  <div>\${escapeHtml(appState?.openDartLastError || (status === "healthy" ? "연결 확인이 완료되었습니다." : "아직 연결을 확인하지 않았습니다."))}</div>
                </div>
              </div>
            </div>
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
                <div class="row">
                  <span class="chip">버전 v\${escapeHtml(appState?.extensionVersion || "0.0.0")}</span>
                  <button class="button secondary" data-action="add-profile-files">파일 가져오기</button>
                </div>
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
        const projectCreateOpen = isCollapsibleOpen("projectCreate");
        const insightStatus = projectInsightStatusMeta(project);
        const insightDocuments = project
          ? project.documents.filter((document) => [
            "company-insight.md",
            "job-insight.md",
            "application-strategy.md",
            "question-analysis.md"
          ].includes(document.title))
          : [];
        const inlineBusyMessage = selectedTab === "projects" ? appState?.busyMessage || "" : "";
        const showManualFallback = Boolean(project?.record?.jobPostingManualFallback);
        const showReviewFields = Boolean(
          project && (
            project.record.postingAnalyzedAt ||
            project.record.companyName ||
            project.record.roleName ||
            project.record.mainResponsibilities ||
            project.record.qualifications ||
            project.record.preferredQualifications ||
            (project.record.keywords || []).length > 0 ||
            (project.record.openDartCandidates || []).length > 0
          )
        );
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
                <button class="button secondary" type="button" data-action="toggle-collapsible" data-key="projectCreate" aria-expanded="\${projectCreateOpen ? "true" : "false"}">\${projectCreateOpen ? "생성 닫기" : "새 프로젝트"}</button>
              </div>
            </div>

            <div class="project-create-shell collapsible-shell \${projectCreateOpen ? "open" : ""}">
              <div class="collapsible-panel">
                <div class="collapsible-panel-inner">
                  <form id="project-form" class="project-inline-panel">
                    <div class="section-heading">새 프로젝트</div>
                    <label>지원 공고 URL<input name="jobPostingUrl" type="text" placeholder="https://..." /></label>
                    <div class="stack" style="gap:8px;">
                      <strong>에세이 문항</strong>
                      <div id="project-create-questions" class="essay-question-fields">\${renderEssayQuestionFields([""])}</div>
                      <div class="actions">
                        <button class="button secondary" type="button" data-action="add-essay-question" data-target="project-create-questions">문항 추가</button>
                      </div>
                    </div>
                    <div class="muted small">회사명과 포지션은 공고 분석 후 자동 추출됩니다. URL 접근이 막힌 경우에만 프로젝트 상세에서 수동 입력 칸이 열립니다.</div>
                    <div class="muted small">빈 문항은 저장할 때 자동으로 제외됩니다.</div>
                    <div class="actions">
                      <button class="button" type="submit">프로젝트 만들기</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            \${project ? \`
              <div class="project-workspace">
                <div class="project-summary row space">
                  <div class="stack" style="gap:4px;">
                    <strong>\${escapeHtml(project.record.companyName || "새 프로젝트")}</strong>
                    \${project.record.roleName ? \`<div class="muted small">\${escapeHtml(project.record.roleName)}</div>\` : ""}
                  </div>
                  <div class="row">
                    <span class="chip \${escapeHtml(insightStatus.className)}">\${escapeHtml(insightStatus.label)}</span>
                    <div class="muted small">슬러그: \${escapeHtml(project.record.slug)}</div>
                  </div>
                </div>

                <div class="card insight-status-card">
                  <div class="row space">
                    <div class="stack" style="gap:4px;">
                      <strong>인사이트 프리패스</strong>
                      <div class="muted small">\${escapeHtml(insightStatus.description)}</div>
                    </div>
                    <div class="row">
                      <span class="chip \${appState.openDartConfigured ? "ok" : "bad"}">OpenDART \${appState.openDartConfigured ? "준비됨" : "미설정"}</span>
                      <span class="chip">\${escapeHtml(\`문서 \${insightDocuments.length}개\`)}</span>
                    </div>
                  </div>
                  <div class="grid two insight-status-grid">
                    <div class="stack">
                      <div class="muted small">최근 공고 분석</div>
                      <div>\${escapeHtml(formatTimestamp(project.record.postingAnalyzedAt) || "아직 없음")}</div>
                    </div>
                    <div class="stack">
                      <div class="muted small">최근 인사이트 생성</div>
                      <div>\${escapeHtml(formatTimestamp(project.record.insightLastGeneratedAt) || "아직 없음")}</div>
                    </div>
                  </div>
                  \${project.record.openDartCorpName || project.record.openDartCorpCode ? \`
                    <div class="muted small">OpenDART 매칭: \${escapeHtml(project.record.openDartCorpName || project.record.companyName)}\${project.record.openDartStockCode ? \` (\${escapeHtml(project.record.openDartStockCode)})\` : ""}</div>
                  \` : ""}
                  \${project.record.insightLastError ? \`<div class="muted small insight-warning">\${escapeHtml(project.record.insightLastError)}</div>\` : ""}
                  <div class="actions">
                    \${insightDocuments.length > 0 ? '<button class="button" type="button" data-action="open-insight-workspace">인사이트 열기</button>' : ""}
                    <button class="button secondary" type="button" data-action="open-settings" data-settings-tab="openDart">OpenDART 설정</button>
                  </div>
                  <div class="muted small">OpenDART 키는 설정 모달에서 관리합니다. 키가 없어도 공고 기반 인사이트는 생성할 수 있습니다.</div>
                </div>

                <form id="project-info-form" class="project-info-form">
                  <div class="card">
                    <div class="stack" style="gap:4px;">
                      <strong>공고 입력</strong>
                      <div class="muted small">먼저 URL과 문항만 입력하세요. 공고 분석이 성공하면 아래에 검토/수정 영역이 자동으로 열립니다.</div>
                    </div>
                    <label>지원 공고 URL<input name="jobPostingUrl" type="text" value="\${escapeHtml(project.record.jobPostingUrl || "")}" placeholder="https://..." /></label>
                    <div class="stack" style="gap:8px;">
                      <strong>에세이 문항</strong>
                      <div id="project-edit-questions" class="essay-question-fields">\${renderEssayQuestionFields(project.record.essayQuestions)}</div>
                      <div class="actions">
                        <button class="button secondary" type="button" data-action="add-essay-question" data-target="project-edit-questions">문항 추가</button>
                      </div>
                      <div class="muted small">빈 문항은 저장할 때 자동으로 제외됩니다.</div>
                    </div>
                    \${showManualFallback ? \`
                      <div class="card">
                        <strong>수동 입력 필요</strong>
                        <div class="muted small insight-warning">자동 공고 분석에 실패했습니다. 공고 본문을 붙여 넣고 다시 생성하면 됩니다.</div>
                        <label>공고 원문 붙여넣기<textarea name="jobPostingText" placeholder="공고 페이지 접근이 안 되면 여기에 본문을 붙여넣으세요">\${escapeHtml(project.record.jobPostingText || "")}</textarea></label>
                      </div>
                    \` : \`<input name="jobPostingText" type="hidden" value="\${escapeHtml(project.record.jobPostingText || "")}" />\`}
                  </div>
                  \${showReviewFields ? \`
                    <div class="card">
                      <div class="stack" style="gap:4px;">
                        <strong>추출 결과 검토</strong>
                        <div class="muted small">자동 추출 결과를 확인하고 필요한 부분만 수정하세요.</div>
                      </div>
                      <div class="grid two">
                        <label>회사 이름<input name="companyName" type="text" value="\${escapeHtml(project.record.companyName || "")}" placeholder="회사명" /></label>
                        <label>포지션<input name="roleName" type="text" value="\${escapeHtml(project.record.roleName || "")}" placeholder="검색 엔진 및 Backend 개발 및 운영" /></label>
                      </div>
                      <label>주요 업무<textarea name="mainResponsibilities" placeholder="공고의 주요 업무를 붙여넣으세요">\${escapeHtml(project.record.mainResponsibilities || "")}</textarea></label>
                      <label>자격요건<textarea name="qualifications" placeholder="공고의 자격요건을 붙여넣으세요">\${escapeHtml(project.record.qualifications || "")}</textarea></label>
                      <label>우대사항<textarea name="preferredQualifications" placeholder="우대사항이 있으면 붙여넣으세요">\${escapeHtml(project.record.preferredQualifications || "")}</textarea></label>
                      <label>키워드 / 기술 스택<textarea name="keywords" placeholder="Java, Spring Boot, Kafka">\${escapeHtml(joinKeywords(project.record.keywords))}</textarea></label>
                      \${project.record.openDartCandidates?.length ? \`
                        <label>OpenDART 회사 후보
                          <select name="openDartCorpCode">
                            <option value="">후보를 선택하세요</option>
                            \${project.record.openDartCandidates.map((candidate) => \`
                              <option value="\${escapeHtml(candidate.corpCode)}" \${candidate.corpCode === project.record.openDartCorpCode ? "selected" : ""}>
                                \${escapeHtml(candidate.corpName)}\${candidate.stockCode ? \` • \${escapeHtml(candidate.stockCode)}\` : ""}
                              </option>
                            \`).join("")}
                          </select>
                        </label>
                      \` : \`<input name="openDartCorpCode" type="hidden" value="\${escapeHtml(project.record.openDartCorpCode || "")}" />\`}
                    </div>
                  \` : \`
                    <input name="companyName" type="hidden" value="\${escapeHtml(project.record.companyName || "")}" />
                    <input name="roleName" type="hidden" value="\${escapeHtml(project.record.roleName || "")}" />
                    <input name="mainResponsibilities" type="hidden" value="\${escapeHtml(project.record.mainResponsibilities || "")}" />
                    <input name="qualifications" type="hidden" value="\${escapeHtml(project.record.qualifications || "")}" />
                    <input name="preferredQualifications" type="hidden" value="\${escapeHtml(project.record.preferredQualifications || "")}" />
                    <input name="keywords" type="hidden" value="\${escapeHtml(joinKeywords(project.record.keywords))}" />
                    <input name="openDartCorpCode" type="hidden" value="\${escapeHtml(project.record.openDartCorpCode || "")}" />
                  \`}
                  \${inlineBusyMessage ? \`
                    <div class="project-inline-status busy" role="status" aria-live="polite">
                      <div class="project-inline-status-label">
                        <span class="status-spinner"></span>
                        <strong>진행 중</strong>
                      </div>
                      <div class="project-inline-status-message">\${escapeHtml(inlineBusyMessage)}</div>
                    </div>
                  \` : ""}
                  <div class="actions">
                    <button class="button" type="submit">저장</button>
                    <button class="button secondary" type="button" data-action="analyze-project-insights">공고 분석</button>
                    <button class="button secondary" type="button" data-action="generate-project-insights">인사이트 생성</button>
                    \${insightDocuments.length > 0 ? '<button class="button secondary" type="button" data-action="open-insight-workspace">인사이트 열기</button>' : ""}
                    <button class="button danger" type="button" data-action="delete-project">삭제</button>
                  </div>
                </form>

                \${renderProjectFold("projectRubric", "평가 기준", \`
                  <label>평가 기준<textarea id="project-rubric">\${escapeHtml(project.record.rubric)}</textarea></label>
                  <div class="actions">
                    <button class="button" data-action="save-project-rubric">저장</button>
                    <button class="button secondary" type="button" data-action="reset-project-rubric">초기화</button>
                  </div>
                \`)}

                \${renderProjectFold("projectContext", "프로젝트 컨텍스트", \`
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
                \`)}
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
        const questions = projectQuestions(project);
        const extraDocuments = projectExtraRunDocuments(project);
        ensureRunFormState(project, extraDocuments);
        const formState = projectRunFormState(project);
        const currentQuestionIndex = activeQuestionIndex(project);
        const currentQuestion = activeQuestionText(project);
        const currentQuestionState = activeSavedAnswerState(project);
        const currentQuestionStatus = runQuestionStatus(project, currentQuestionIndex);
        const activeReviewMode = currentReviewMode();
        const continuationDisabledAttr = appState?.busyMessage || appState.runState?.status !== "idle" ? "disabled" : "";
        const healthyProviderIds = new Set(healthyProviders.map((provider) => provider.providerId));
        const runSetupOpen = isCollapsibleOpen("runSetup");
        const defaultAssignments = defaultRunRoleAssignments(healthyProviders);
        const defaultAssignmentsByKey = new Map(defaultAssignments.map((assignment) => [assignment.roleKey, assignment]));
        const roleAssignmentsByKey = new Map(runRoleAssignments.map((assignment) => [assignment.roleKey, assignment]));
        const overrideCount = runRoleAssignments.filter((assignment) => !assignment.useProviderDefaults).length;
        const roleGroups = runRoleGroupOrder.map((groupKey) => ({
          key: groupKey,
          label: runRoleGroupLabels[groupKey] || groupKey,
          roles: runRoleDefinitions.filter((role) => role.groupKey === groupKey)
        }));
        const canRunReview =
          appState.runState?.status === "idle" &&
          Boolean(currentQuestion) &&
          runRoleAssignments.length === runRoleOrder.length &&
          runRoleAssignments.every((assignment) => Boolean(assignment.providerId) && healthyProviderIds.has(assignment.providerId));
        const canCompleteQuestion = appState.runState?.status === "idle" && Boolean(currentQuestion);

        if (questions.length === 0) {
          return \`
            <div class="stack">
              <div class="card">
                <strong>자기소개서</strong>
                <label>
                  프로젝트
                  <select data-action="set-selected-project">
                    \${appState.projects.map((item) => \`
                      <option value="\${item.record.slug}" \${item.record.slug === selectedProjectSlug ? "selected" : ""}>\${escapeHtml(item.record.companyName)}\${item.record.roleName ? " • " + escapeHtml(item.record.roleName) : ""}</option>
                    \`).join("")}
                  </select>
                </label>
              </div>
              <div class="card">
                <strong>문항이 아직 없습니다.</strong>
                <div class="muted small">Essay 탭은 이제 프로젝트에 저장된 문항을 기준으로 작업합니다. Projects 탭에서 문항을 추가하면 여기서 문항 1부터 바로 작성할 수 있습니다.</div>
                <div class="actions">
                  <button class="button secondary" type="button" data-action="switch-tab" data-tab="projects">프로젝트 탭으로 이동</button>
                </div>
              </div>
            </div>
          \`;
        }

        function renderProviderOptions(selectedProviderId) {
          return healthyProviders.length === 0
            ? '<option value="">정상 도구가 없습니다</option>'
            : healthyProviders.map((provider) => \`
              <option value="\${provider.providerId}" \${selectedProviderId === provider.providerId ? "selected" : ""}>\${escapeHtml(providerLabels[provider.providerId] || provider.providerId)}</option>
            \`).join("");
        }

        function renderModelOptions(roleAssignment, provider) {
          const modelOptions = provider?.capabilities?.modelOptions || [];
          const currentValue = roleAssignment?.modelOverride || "";
          const optionValues = new Set(modelOptions.map((option) => option.value));
          return [
            \`<option value="" \${currentValue ? "" : "selected"}>기본값 상속</option>\`,
            currentValue && !optionValues.has(currentValue)
              ? \`<option value="\${escapeHtml(currentValue)}" selected>\${escapeHtml(currentValue)}</option>\`
              : "",
            ...modelOptions.map((option) => \`
              <option value="\${escapeHtml(option.value)}" \${currentValue === option.value ? "selected" : ""}>\${escapeHtml(option.label)}</option>
            \`)
          ].join("");
        }

        function renderEffortOptions(roleAssignment, provider) {
          const currentValue = roleAssignment?.effortOverride || "";
          const supportsEffort = Boolean(provider?.capabilities?.supportsEffort);
          return supportsEffort
            ? [
              \`<option value="" \${currentValue ? "" : "selected"}>기본값 상속</option>\`,
              ...(provider?.capabilities?.effortOptions || []).map((option) => \`
                <option value="\${escapeHtml(option.value)}" \${currentValue === option.value ? "selected" : ""}>\${escapeHtml(option.label)}</option>
              \`)
            ].join("")
            : '<option value="">지원 안 함</option>';
        }

        function renderRoleSummary(roleAssignment) {
          if (!roleAssignment) {
            return "";
          }

          const providerSummary = roleAssignmentStatusLabel(roleAssignment);
          const overrideSummary = roleOverrideSummary(roleAssignment);
          return \`
            <div class="row role-summary">
              <span class="chip">\${escapeHtml(providerSummary)}</span>
              <span class="chip">\${escapeHtml(overrideSummary)}</span>
            </div>
          \`;
        }

        function renderRoleAssignmentRow(role) {
          const assignment = roleAssignmentsByKey.get(role.roleKey) || defaultAssignmentsByKey.get(role.roleKey) || {
            roleKey: role.roleKey,
            providerId: "",
            modelOverride: "",
            effortOverride: "",
            useProviderDefaults: true
          };
          const provider = (appState.providers || []).find((item) => item.providerId === assignment.providerId);
          const providerSelectDisabled = healthyProviders.length === 0 || appState.runState?.status !== "idle";
          return \`
            <div class="role-row">
              <div class="row space role-row-header">
                <div class="stack" style="gap:4px;">
                  <strong>\${escapeHtml(role.label)}</strong>
                  <div class="muted small">\${escapeHtml(role.description)}</div>
                </div>
                \${renderRoleSummary(assignment)}
              </div>
              <label class="participant-field role-provider-field">
                담당 provider
                <select class="participant-select role-provider-select" data-action="set-run-role-provider" data-role-key="\${role.roleKey}" \${providerSelectDisabled ? "disabled" : ""}>
                  \${renderProviderOptions(assignment.providerId)}
                </select>
              </label>
              <div class="muted small">현재 선택: \${escapeHtml(providerLabel(assignment.providerId))}\${provider ? \` · \${escapeHtml(providerConfiguredModelLabel(provider.providerId) || "기본 설정")}\` : ""}</div>
            </div>
          \`;
        }

        function renderRoleOverrideRow(role) {
          const assignment = roleAssignmentsByKey.get(role.roleKey) || defaultAssignmentsByKey.get(role.roleKey) || {
            roleKey: role.roleKey,
            providerId: "",
            modelOverride: "",
            effortOverride: "",
            useProviderDefaults: true
          };
          const provider = (appState.providers || []).find((item) => item.providerId === assignment.providerId);
          const supportsEffort = Boolean(provider?.capabilities?.supportsEffort);
          const providerSelectDisabled = healthyProviders.length === 0 || appState.runState?.status !== "idle";
          return \`
            <div class="role-override-row">
              <div class="row space role-override-header">
                <div class="stack" style="gap:4px;">
                  <strong>\${escapeHtml(role.label)}</strong>
                  <div class="muted small">\${escapeHtml(role.description)}</div>
                </div>
                <label class="toggle-pill">
                  <input
                    type="checkbox"
                    data-action="toggle-run-role-defaults"
                    data-role-key="\${role.roleKey}"
                    \${assignment.useProviderDefaults ? "checked" : ""}
                  />
                  <span>기본값 상속</span>
                </label>
              </div>
              <div class="settings-grid role-override-grid">
                <label>
                  모델 override
                  <select
                    data-action="set-run-role-model"
                    data-role-key="\${role.roleKey}"
                    \${assignment.useProviderDefaults || providerSelectDisabled ? "disabled" : ""}
                  >
                    \${renderModelOptions(assignment, provider)}
                  </select>
                </label>
                <label>
                  effort override
                  <select
                    data-action="set-run-role-effort"
                    data-role-key="\${role.roleKey}"
                    \${assignment.useProviderDefaults || providerSelectDisabled || !supportsEffort ? "disabled" : ""}
                  >
                    \${renderEffortOptions(assignment, provider)}
                  </select>
                </label>
              </div>
              <div class="muted small">\${assignment.useProviderDefaults ? "선택한 provider의 기본 모델과 effort을 그대로 사용합니다." : "이 역할만 별도 override가 적용됩니다."}\${supportsEffort ? "" : " 이 provider는 effort override를 지원하지 않습니다."}</div>
            </div>
          \`;
        }

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
              <div class="muted small">현재 프로젝트: \${escapeHtml(project.record.companyName)}. 역할 배치는 7개 top-level 역할로 구성되며, 각 역할은 정상 상태의 provider를 하나씩 선택해야 합니다. 현재 정상 도구: \${healthyProviders.map((provider) => provider.providerId).join(", ") || "없음"}.</div>
            </div>

            <div class="card">
              <div class="row space">
                <strong>문항 진행</strong>
                <span class="chip">\${escapeHtml(\`\${questions.length}개 문항\`)}</span>
              </div>
              <div class="question-nav-list">
                \${questions.map((question, questionIndex) => {
                  const status = runQuestionStatus(project, questionIndex);
                  const isActive = questionIndex === currentQuestionIndex;
                  return \`
                    <button
                      class="button secondary question-nav-button \${isActive ? "selected" : ""}"
                      type="button"
                      data-action="set-active-question"
                      data-question-index="\${questionIndex}">
                      <span>\${escapeHtml(\`문항 \${questionIndex + 1}\`)}</span>
                      <span class="chip \${escapeHtml(runQuestionStatusClassName(status))}">\${escapeHtml(runQuestionStatusLabel(status))}</span>
                    </button>
                  \`;
                }).join("")}
              </div>
              <div class="stack question-workspace-card" style="gap:8px;">
                <div class="row space">
                  <strong>\${escapeHtml(\`문항 \${currentQuestionIndex + 1}\`)}</strong>
                  <span class="chip \${escapeHtml(runQuestionStatusClassName(currentQuestionStatus))}">\${escapeHtml(runQuestionStatusLabel(currentQuestionStatus))}</span>
                </div>
                <div class="question-workspace-text">\${escapeHtml(currentQuestion)}</div>
                \${currentQuestionState?.completedAt ? \`<div class="muted small">최근 완료: \${escapeHtml(formatTimestamp(currentQuestionState.completedAt))}</div>\` : '<div class="muted small">아직 완료되지 않은 문항입니다.</div>'}
              </div>
            </div>

            <section class="card run-setup-card collapsible-shell \${runSetupOpen ? "open" : ""}">
              <button class="run-setup-summary collapsible-toggle" type="button" data-action="toggle-collapsible" data-key="runSetup" aria-expanded="\${runSetupOpen ? "true" : "false"}">
                <div class="stack" style="gap:4px;">
                  <strong>실행 설정</strong>
                  <div class="muted small">\${runSetupOpen ? "현재 문항 초안, 컨텍스트, 역할 배치를 조정하세요." : "현재 문항 실행 설정을 펼쳐서 수정하세요."}</div>
                </div>
                <div class="row run-setup-summary-meta">
                  <span class="chip">\${escapeHtml(\`문항 \${currentQuestionIndex + 1}\`)}</span>
                  <span class="chip">\${escapeHtml(reviewModeLabel(activeReviewMode))}</span>
                  <span class="chip">\${escapeHtml(roleCountLabel(runRoleAssignments.length || runRoleOrder.length))}</span>
                  <span class="chip">\${escapeHtml(overrideCount > 0 ? \`오버라이드 \${overrideCount}개\` : "기본값 상속")}</span>
                  <span class="project-fold-chevron collapsible-chevron" aria-hidden="true">⌄</span>
                </div>
              </button>
              <div class="collapsible-panel">
              <div class="collapsible-panel-inner">
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
              <div class="stack" style="gap:8px;">
                <strong>현재 문항</strong>
                <div class="question-workspace-text">\${escapeHtml(currentQuestion)}</div>
              </div>
              <label>현재 초안<textarea id="run-draft" placeholder="현재 문항 답안을 작성하세요">\${escapeHtml(activeQuestionDraft(project) || "")}</textarea></label>
              <label>노션 요청<textarea id="run-notion-request" placeholder="CJ 올리브네트웍스 페이지 가져와서 파악해">\${escapeHtml(formState.notionRequest || "")}</textarea></label>
              <div class="muted small">\${activeReviewMode === "realtime"
                ? "실시간 대화형은 짧은 토론을 이어가다가 모든 리뷰어가 승인하면 마지막에만 장문 최종본을 작성합니다. 문항 답안이 정리되면 아래의 완료 버튼으로 프로젝트 컨텍스트에 반영하세요."
                : "심화 피드백은 각 실행마다 요약, 개선안, 수정 초안을 갱신합니다. 충분히 다듬어졌다면 완료 버튼으로 현재 문항 답안을 고정하세요."}</div>
              \${appState.runState?.status !== "idle" ? \`<div class="muted small">진행 중인 실행: \${escapeHtml(appState.runState.message || appState.runState.status)}</div>\` : ""}
              <div class="stack">
                <div class="row space">
                  <strong>역할 배치</strong>
                  <button
                    class="button secondary role-advanced-toggle"
                    type="button"
                    data-action="toggle-run-role-advanced"
                    aria-expanded="\${runRoleAdvancedOpen ? "true" : "false"}">
                    \${runRoleAdvancedOpen ? "고급 옵션 닫기" : "고급 옵션 열기"}
                  </button>
                </div>
                <div class="muted small">기본 화면에서는 7개 top-level 역할의 provider를 배치하고, 모델/effort override는 고급 옵션에서만 조정합니다.</div>
                \${roleGroups.map((group) => \`
                  <section class="role-group">
                    <div class="row space role-group-header">
                      <div class="stack" style="gap:4px;">
                        <strong>\${escapeHtml(group.label)}</strong>
                        <div class="muted small">\${escapeHtml(group.key === "research" ? "문항과 맥락을 조사합니다." : group.key === "drafting" ? "초안과 최종본을 조율합니다." : "검토와 보완 기준을 확인합니다.")}</div>
                      </div>
                      <span class="chip">\${escapeHtml(\`\${group.roles.length}개 역할\`)}</span>
                    </div>
                    <div class="stack">\${group.roles.map((role) => renderRoleAssignmentRow(role)).join("")}</div>
                  </section>
                \`).join("")}
                \${runRoleAdvancedOpen ? \`
                  <div class="role-advanced-panel">
                    <div class="row space">
                      <strong>고급 옵션</strong>
                      <span class="chip">\${escapeHtml(\`override 대상 \${overrideCount}개\`)}</span>
                    </div>
                    <div class="muted small">각 역할에 대해 provider 기본값을 유지할지, 아니면 모델과 effort를 별도로 override할지 지정합니다.</div>
                    <div class="stack">\${runRoleDefinitions.map((role) => renderRoleOverrideRow(role)).join("")}</div>
                  </div>
                \` : ""}
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
                <button class="button secondary" type="button" data-action="complete-essay-question" \${canCompleteQuestion ? "" : "disabled"}>\${currentQuestionState?.status === "completed" ? "완료 업데이트" : "완료"}</button>
                <button class="button secondary" type="button" data-action="reset-run-form" \${appState.runState?.status !== "idle" ? "disabled" : ""}>초기화</button>
              </div>
            </div>
            </div>
            </div>
            </section>

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
                \${conversationChip(\`역할: \${runRoleAssignments.length || runRoleOrder.length}개\`)}
                \${conversationChip(\`오버라이드: \${overrideCount}개\`)}
                \${conversationChip(\`정상 도구: \${healthyProviders.length}\`)}
                \${conversationChip("개입: 자동 일시정지")}
                \${conversationChip("마크다운: 완료")}
              </div>
              <div id="discussion-ledger-summary" class="discussion-ledger-summary-host" hidden></div>
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
                      \${run.artifacts.finalChecks ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="final-checks.md">최종 점검 열기</button>\` : ""}
                      \${run.artifacts.discussionLedger ? \`<button class="button secondary" data-action="open-artifact" data-project-slug="\${project.record.slug}" data-run-id="\${run.record.id}" data-file-name="discussion-ledger.md">토론 상태 열기</button>\` : ""}
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
          <div class="doc-item \${scope === "profile" ? "profile-doc-item" : ""}">
            \${scope === "profile" ? \`
              <div class="row space doc-item-header">
                <button class="doc-preview-trigger" type="button" data-action="open-profile-document-preview" data-document-id="\${document.id}">
                  <div class="doc-preview-header">
                    <div>
                      <strong>\${escapeHtml(document.title)}</strong>
                      <div class="muted small">\${escapeHtml(document.sourceType)} • \${escapeHtml(document.extractionStatus)}</div>
                    </div>
                    <span class="doc-preview-hint">세부 내용 보기</span>
                  </div>
                  \${document.note ? \`<div class="small">\${escapeHtml(document.note)}</div>\` : ""}
                  <div class="muted small">\${escapeHtml(document.rawPath)}</div>
                </button>
                <label class="pin-toggle" title="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}">
                  <input
                    type="checkbox"
                    aria-label="\${document.pinnedByDefault ? "기본 포함됨" : "기본 포함"}"
                    data-action="toggle-profile-pinned"
                    data-document-id="\${document.id}"
                    \${document.pinnedByDefault ? "checked" : ""}
                  />
                  <span class="pin-icon" aria-hidden="true"></span>
                </label>
              </div>
            \` : \`
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
            \`}
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
