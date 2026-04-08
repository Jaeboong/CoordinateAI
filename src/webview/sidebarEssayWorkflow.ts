export const essayWorkflowSource = String.raw`
      function normalizeRunFormStateStore(raw) {
        if (raw && typeof raw === "object" && raw.projectStates && typeof raw.projectStates === "object") {
          return {
            projectStates: raw.projectStates
          };
        }

        return {
          projectStates: {},
          legacyState: raw && typeof raw === "object" ? raw : null
        };
      }
      function projectQuestions(project) {
        return Array.isArray(project?.record?.essayQuestions) ? project.record.essayQuestions : [];
      }

      function normalizeProjectQuestionIndex(value, questionCount) {
        if (questionCount < 1) {
          return 0;
        }

        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          return 0;
        }

        return Math.min(parsed, questionCount - 1);
      }

      function savedEssayAnswerState(project, questionIndex) {
        return (project?.essayAnswerStates || []).find((state) => state.questionIndex === questionIndex) || null;
      }

      function normalizeProjectRunFormState(project, rawState, continuation) {
        const questions = projectQuestions(project);
        const legacyQuestion = typeof rawState?.question === "string" ? rawState.question.trim() : "";
        const legacyDraft = typeof rawState?.draft === "string" ? rawState.draft : "";
        const rawQuestionStates = Array.isArray(rawState?.questionStates) ? rawState.questionStates : [];
        const continuationQuestionIndex = continuation?.projectQuestionIndex;
        const continuationDraft = typeof continuation?.draft === "string" ? continuation.draft : "";
        const questionStates = questions.map((question, questionIndex) => {
          const rawQuestionState = rawQuestionStates[questionIndex];
          const savedState = savedEssayAnswerState(project, questionIndex);
          let draft = typeof rawQuestionState?.draft === "string" ? rawQuestionState.draft : "";
          if (!draft && legacyDraft && legacyQuestion && question.trim() === legacyQuestion) {
            draft = legacyDraft;
          }
          if (!draft && continuationDraft && continuationQuestionIndex === questionIndex) {
            draft = continuationDraft;
          }
          if (!draft && savedState?.content) {
            draft = savedState.content;
          }
          return { draft };
        });

        return {
          activeQuestionIndex: normalizeProjectQuestionIndex(
            rawState?.activeQuestionIndex ?? continuationQuestionIndex,
            questions.length
          ),
          questionStates,
          notionRequest: String(
            rawState?.notionRequest ?? continuation?.notionRequest ?? ""
          ),
          continuationNote: String(rawState?.continuationNote || ""),
          selectedDocumentIds: Array.isArray(rawState?.selectedDocumentIds)
            ? rawState.selectedDocumentIds.map((value) => String(value))
            : (Array.isArray(continuation?.selectedDocumentIds)
              ? continuation.selectedDocumentIds.map((value) => String(value))
              : [])
        };
      }

      function projectRunFormState(project) {
        if (!project?.record?.slug) {
          return {
            activeQuestionIndex: 0,
            questionStates: [],
            notionRequest: "",
            continuationNote: "",
            selectedDocumentIds: []
          };
        }

        const store = normalizeRunFormStateStore(runFormState);
        const slug = project.record.slug;
        const continuation = runContinuation?.projectSlug === slug ? runContinuation : null;
        const rawState = store.projectStates[slug] ?? store.legacyState;
        const nextState = normalizeProjectRunFormState(project, rawState, continuation);
        store.projectStates[slug] = nextState;
        delete store.legacyState;
        runFormState = store;
        return nextState;
      }

      function setProjectRunFormState(projectSlug, nextState) {
        const store = normalizeRunFormStateStore(runFormState);
        store.projectStates[projectSlug] = nextState;
        delete store.legacyState;
        runFormState = store;
      }

      function ensureProjectRunQuestionState(project, projectState, questionIndex) {
        const nextQuestionStates = Array.isArray(projectState?.questionStates)
          ? projectState.questionStates.slice()
          : [];
        if (!nextQuestionStates[questionIndex]) {
          nextQuestionStates[questionIndex] = {
            draft: savedEssayAnswerState(project, questionIndex)?.content || ""
          };
        }
        return nextQuestionStates;
      }

      function updateProjectRunFormState(project, updates) {
        if (!project?.record?.slug) {
          return null;
        }

        const current = projectRunFormState(project);
        const nextState = {
          ...current,
          ...updates
        };
        setProjectRunFormState(project.record.slug, nextState);
        return nextState;
      }

      function activeQuestionIndex(project) {
        return projectRunFormState(project).activeQuestionIndex;
      }

      function setActiveQuestionIndex(project, questionIndex) {
        if (!project?.record?.slug) {
          return null;
        }

        const questions = projectQuestions(project);
        const current = projectRunFormState(project);
        const nextIndex = normalizeProjectQuestionIndex(questionIndex, questions.length);
        const nextQuestionStates = ensureProjectRunQuestionState(project, current, nextIndex);
        const nextState = {
          ...current,
          activeQuestionIndex: nextIndex,
          questionStates: nextQuestionStates
        };
        setProjectRunFormState(project.record.slug, nextState);
        return nextState;
      }

      function activeQuestionText(project) {
        return projectQuestions(project)[activeQuestionIndex(project)] || "";
      }

      function questionDraft(project, questionIndex) {
        return projectRunFormState(project).questionStates[questionIndex]?.draft || "";
      }

      function activeQuestionDraft(project) {
        return questionDraft(project, activeQuestionIndex(project));
      }

      function setQuestionDraft(project, questionIndex, draft) {
        if (!project?.record?.slug) {
          return null;
        }

        const current = projectRunFormState(project);
        const nextQuestionStates = ensureProjectRunQuestionState(project, current, questionIndex);
        nextQuestionStates[questionIndex] = {
          draft: String(draft || "")
        };
        const nextState = {
          ...current,
          questionStates: nextQuestionStates
        };
        setProjectRunFormState(project.record.slug, nextState);
        return nextState;
      }

      function updateActiveQuestionDraft(project, draft) {
        return setQuestionDraft(project, activeQuestionIndex(project), draft);
      }

      function runQuestionStatus(project, questionIndex) {
        const savedState = savedEssayAnswerState(project, questionIndex);
        if (savedState?.status === "completed") {
          return "completed";
        }
        return questionDraft(project, questionIndex).trim() ? "drafting" : "idle";
      }

      function runQuestionStatusLabel(status) {
        switch (status) {
          case "completed":
            return "완료";
          case "drafting":
            return "작성 중";
          default:
            return "미작성";
        }
      }

      function runQuestionStatusClassName(status) {
        switch (status) {
          case "completed":
            return "ok";
          case "drafting":
            return "";
          default:
            return "muted";
        }
      }

      function activeSavedAnswerState(project) {
        return savedEssayAnswerState(project, activeQuestionIndex(project));
      }

      function projectExtraRunDocuments(project) {
        return [
          ...(appState?.profileDocuments || []).filter((document) => !document.pinnedByDefault),
          ...(project?.documents || []).filter((document) => !document.pinnedByDefault)
        ];
      }

      function advanceToNextQuestion(project) {
        const questions = projectQuestions(project);
        if (questions.length < 2) {
          return projectRunFormState(project);
        }
        const currentIndex = activeQuestionIndex(project);
        const nextIndex = currentIndex < questions.length - 1 ? currentIndex + 1 : currentIndex;
        return setActiveQuestionIndex(project, nextIndex);
      }

      function applyRunContinuationToProjectState(continuation) {
        if (!continuation?.projectSlug) {
          return;
        }

        const project = (appState?.projects || []).find((item) => item.record.slug === continuation.projectSlug);
        if (!project) {
          return;
        }

        const questions = projectQuestions(project);
        const nextIndex = normalizeProjectQuestionIndex(continuation.projectQuestionIndex, questions.length);
        const current = projectRunFormState(project);
        const nextQuestionStates = ensureProjectRunQuestionState(project, current, nextIndex);
        nextQuestionStates[nextIndex] = {
          draft: continuation.draft || nextQuestionStates[nextIndex]?.draft || ""
        };

        setProjectRunFormState(project.record.slug, {
          ...current,
          activeQuestionIndex: nextIndex,
          questionStates: nextQuestionStates,
          notionRequest: continuation.notionRequest || "",
          continuationNote: "",
          selectedDocumentIds: [...(continuation.selectedDocumentIds || [])]
        });
      }

      function resetRunFormState(project, extraDocuments) {
        runContinuation = null;
        if (!project?.record?.slug) {
          runFormState = normalizeRunFormStateStore(null);
          return;
        }

        setProjectRunFormState(
          project.record.slug,
          normalizeProjectRunFormState(project, {
            activeQuestionIndex: 0,
            notionRequest: "",
            continuationNote: "",
            selectedDocumentIds: []
          })
        );
        ensureRunFormState(project, extraDocuments || []);
      }

      function ensureRunFormState(project, extraDocuments) {
        if (!project?.record?.slug) {
          return;
        }

        const current = projectRunFormState(project);
        const availableIds = new Set((extraDocuments || []).map((document) => document.id));
        const nextSelectedDocumentIds = (current.selectedDocumentIds || []).filter((id) => availableIds.has(id));
        if (nextSelectedDocumentIds.length !== current.selectedDocumentIds.length) {
          updateProjectRunFormState(project, {
            selectedDocumentIds: nextSelectedDocumentIds
          });
        }
      }

`;
