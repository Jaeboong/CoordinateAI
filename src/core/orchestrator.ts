import { ContextCompiler } from "./contextCompiler";
import { ForJobStorage, RunContinuationContext } from "./storage";
import {
  CompileContextProfile,
  DiscussionLedger,
  ProviderId,
  PromptMetrics,
  RunChatMessage,
  ProviderRuntimeState,
  ReviewMode,
  ReviewerPerspective,
  ReviewTurn,
  RunArtifacts,
  RunEvent,
  RunRequest,
  RunRecord
} from "./types";
import { createId, nowIso } from "./utils";

interface ReviewParticipant {
  participantId: string;
  participantLabel: string;
  providerId: ProviderId;
  role: ReviewTurn["role"];
  perspective?: ReviewerPerspective;
}

export interface OrchestratorGateway {
  listRuntimeStates(): Promise<ProviderRuntimeState[]>;
  execute(
    providerId: ProviderId,
    prompt: string,
    options: {
      cwd: string;
      authMode: ProviderRuntimeState["authMode"];
      apiKey?: string;
      round?: number;
      speakerRole?: ReviewTurn["role"];
      messageScope?: string;
      participantId?: string;
      participantLabel?: string;
      onEvent?: (event: RunEvent) => Promise<void> | void;
    }
  ): Promise<{ text: string; stdout: string; stderr: string; exitCode: number }>;
  getApiKey(providerId: ProviderId): Promise<string | undefined>;
}

export interface UserInterventionRequest {
  projectSlug: string;
  runId: string;
  round: number;
  reviewMode: ReviewMode;
  coordinatorProvider: ProviderId;
}

interface BuiltPrompt {
  text: string;
  promptKind: PromptMetrics["promptKind"];
  contextProfile: CompileContextProfile;
  contextChars: number;
  historyChars: number;
  notionBriefChars: number;
  discussionLedgerChars: number;
}

export class ReviewOrchestrator {
  constructor(
    private readonly storage: ForJobStorage,
    private readonly compiler: ContextCompiler,
    private readonly gateway: OrchestratorGateway
  ) {}

  async run(
    request: RunRequest,
    onEvent?: (event: RunEvent) => Promise<void> | void,
    requestUserIntervention?: (request: UserInterventionRequest) => Promise<string | undefined>,
    consumeQueuedMessages?: () => string[]
  ): Promise<{ run: RunRecord; turns: ReviewTurn[]; artifacts: RunArtifacts }> {
    const states = await this.gateway.listRuntimeStates();
    const stateMap = new Map(states.map((state) => [state.providerId, state]));
    const coordinator = buildCoordinatorParticipant(request.coordinatorProvider);
    const requestedReviewers = buildReviewerParticipants(request.reviewerProviders);
    if (requestedReviewers.length < 1) {
      throw new Error("At least one reviewer is required to run a review.");
    }

    const selectedProviders = [coordinator.providerId, ...requestedReviewers.map((reviewer) => reviewer.providerId)];
    const unavailableProviders = [...new Set(selectedProviders.filter((providerId) => stateMap.get(providerId)?.authStatus !== "healthy"))];
    if (unavailableProviders.length > 0) {
      throw new Error(`Selected providers are not healthy: ${unavailableProviders.join(", ")}`);
    }

    const project = await this.storage.getProject(request.projectSlug);
    const profileDocuments = await this.storage.listProfileDocuments();
    const projectDocuments = await this.storage.listProjectDocuments(request.projectSlug);
    const initialCompiled = await this.compiler.compile({
      project,
      profileDocuments,
      projectDocuments,
      selectedDocumentIds: request.selectedDocumentIds,
      question: request.question,
      draft: request.draft,
      charLimit: request.charLimit ?? project.charLimit,
      profile: "full"
    });
    const trimmedContinuationNote = request.continuationNote?.trim() || undefined;
    const normalizedNotionRequest = normalizeNotionRequest(request.notionRequest);
    const derivedNotionRequest = normalizeNotionRequest(deriveImplicitNotionRequest(trimmedContinuationNote));
    const effectiveNotionRequest =
      normalizedNotionRequest ||
      derivedNotionRequest ||
      buildAutoNotionRequest(project.notionPageIds);
    const continuationContext = request.continuationFromRunId
      ? await this.storage.loadRunContinuationContext(request.projectSlug, request.continuationFromRunId)
      : undefined;
    const initialContextMarkdown = appendContinuationContext(
      initialCompiled.markdown,
      continuationContext,
      trimmedContinuationNote
    );

    const runId = createId();
    let run: RunRecord = {
      id: runId,
      projectSlug: request.projectSlug,
      question: request.question,
      draft: request.draft,
      reviewMode: request.reviewMode,
      notionRequest: effectiveNotionRequest,
      coordinatorProvider: request.coordinatorProvider,
      reviewerProviders: request.reviewerProviders,
      continuationFromRunId: request.continuationFromRunId?.trim() || undefined,
      continuationNote: trimmedContinuationNote,
      rounds: 0,
      selectedDocumentIds: request.selectedDocumentIds,
      status: "running",
      startedAt: nowIso()
    };

    await this.storage.createRun(run);
    await this.storage.setLastCoordinatorProvider(request.coordinatorProvider);
    await this.storage.setLastReviewMode(request.reviewMode);
    await this.storage.saveRunTextArtifact(request.projectSlug, runId, "compiled-context.md", initialContextMarkdown);
    const chatMessages = new Map<string, RunChatMessage>();
    const eventSink = async (event: RunEvent) => {
      applyChatEvent(chatMessages, event);
      await this.storage.appendRunEvent(request.projectSlug, runId, event);
      if (onEvent) {
        await onEvent(event);
      }
    };
    await eventSink({ timestamp: nowIso(), type: "run-started", message: "Run started" });
    await eventSink({ timestamp: nowIso(), type: "compiled-context", message: "Compiled context saved" });

    const turns: ReviewTurn[] = [];
    const activeReviewers = requestedReviewers.filter((reviewer) => stateMap.get(reviewer.providerId)?.authStatus === "healthy");
    const compiledContextCache = new Map<string, string>();
    let notionBriefFull = "";
    const userInterventions: Array<{ round: number; text: string }> = [];
    let discussionLedger: DiscussionLedger | undefined;

    try {
      const coordinatorState = stateMap.get(coordinator.providerId);
      if (!coordinatorState) {
        throw new Error("Coordinator provider is unavailable.");
      }

      if (effectiveNotionRequest) {
        const notionCompiled = await this.compiler.compile({
          project,
          profileDocuments,
          projectDocuments,
          selectedDocumentIds: request.selectedDocumentIds,
          question: request.question,
          draft: request.draft,
          charLimit: request.charLimit ?? project.charLimit,
          profile: "minimal"
        });
        const notionContextMarkdown = appendContinuationContext(
          notionCompiled.markdown,
          continuationContext,
          trimmedContinuationNote
        );
        const notionPrompt = buildNotionPrePassPrompt(notionContextMarkdown, effectiveNotionRequest);
        const notionTurn = await this.executeTurn(
          request.projectSlug,
          runId,
          coordinator,
          0,
          notionPrompt,
          coordinatorState,
          eventSink
        );
        turns.push(notionTurn);

        if (notionTurn.status !== "completed") {
          throw new Error(notionTurn.error ?? "Coordinator failed to resolve the Notion request.");
        }

        notionBriefFull = extractNotionBrief(notionTurn.response);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "notion-brief.md", notionTurn.response);
        run = await this.storage.updateRun(request.projectSlug, runId, {
          notionBrief: compressNotionBrief(notionBriefFull, "compact")
        });
      }

      const interactiveMode = Boolean(requestUserIntervention);
      const autoCycleLimit = Math.max(1, request.rounds || 1);
      const savePromptMetricsArtifact = async () => {
        const promptMetrics = turns
          .map((turn) => turn.promptMetrics)
          .filter((metrics): metrics is PromptMetrics => Boolean(metrics));
        if (promptMetrics.length === 0) {
          return;
        }

        await this.storage.saveRunTextArtifact(
          request.projectSlug,
          runId,
          "prompt-metrics.json",
          JSON.stringify(promptMetrics, null, 2)
        );
      };
      const persistTurnsAndChat = async () => {
        await this.storage.saveReviewTurns(request.projectSlug, runId, turns);
        await savePromptMetricsArtifact();
        if (chatMessages.size > 0) {
          await this.storage.saveRunChatMessages(request.projectSlug, runId, [...chatMessages.values()]);
        }
      };
      const saveDeepArtifacts = async (artifacts: RunArtifacts) => {
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "summary.md", artifacts.summary);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "improvement-plan.md", artifacts.improvementPlan);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "revised-draft.md", artifacts.revisedDraft);
      };
      const buildCompiledContextMarkdown = async (
        draft: string,
        round: number,
        unitLabel: "cycle" | "round",
        profile: CompileContextProfile,
        options: { saveArtifact?: boolean } = {}
      ) => {
        const cacheKey = `${profile}::${draft}`;
        let compiledContextMarkdown = compiledContextCache.get(cacheKey);
        if (!compiledContextMarkdown) {
          const compiled = await this.compiler.compile({
            project,
            profileDocuments,
            projectDocuments,
            selectedDocumentIds: request.selectedDocumentIds,
            question: request.question,
            draft,
            charLimit: request.charLimit ?? project.charLimit,
            profile
          });
          compiledContextMarkdown = appendContinuationContext(
            compiled.markdown,
            continuationContext,
            trimmedContinuationNote
          );
          compiledContextCache.set(cacheKey, compiledContextMarkdown);
        }

        if (options.saveArtifact ?? profile !== "minimal") {
          await this.storage.saveRunTextArtifact(request.projectSlug, runId, "compiled-context.md", compiledContextMarkdown);
          if (round > 1) {
            await eventSink({
              timestamp: nowIso(),
              type: "compiled-context",
              round,
              message: `Compiled context refreshed for ${unitLabel} ${round} (${profile})`
            });
          }
        }

        return compiledContextMarkdown;
      };
      const emitUserIntervention = async (round: number, intervention: string) => {
        userInterventions.push({ round, text: intervention });
        const messageId = `user-round-${round}-${createId()}`;
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-started",
          round: round + 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: ""
        });
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-delta",
          round: round + 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: intervention
        });
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-completed",
          round: round + 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: ""
        });
      };
      const emitContinuationMessage = async (message: string) => {
        const trimmed = message.trim();
        if (!trimmed) {
          return;
        }

        const messageId = `user-continuation-${createId()}`;
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-started",
          round: 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: ""
        });
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-delta",
          round: 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: trimmed
        });
        await eventSink({
          timestamp: nowIso(),
          type: "chat-message-completed",
          round: 1,
          messageId,
          speakerRole: "user",
          recipient: "Coordinator",
          message: ""
        });
      };
      const consumeCurrentUserMessages = () =>
        (consumeQueuedMessages?.() ?? [])
          .map((message) => message.trim())
          .filter(Boolean);
      const emitUserMessages = async (round: number, messages: string[]) => {
        for (const message of messages) {
          await emitUserIntervention(round, message);
        }
      };
      const updateDiscussionLedger = async (sourceTurn: ReviewTurn, nextLedger?: DiscussionLedger) => {
        if (!nextLedger) {
          return;
        }

        discussionLedger = nextLedger;
        await eventSink({
          timestamp: nowIso(),
          type: "discussion-ledger-updated",
          providerId: sourceTurn.providerId,
          participantId: sourceTurn.participantId,
          participantLabel: sourceTurn.participantLabel,
          round: nextLedger.updatedAtRound,
          speakerRole: sourceTurn.role,
          message: nextLedger.currentFocus,
          discussionLedger: nextLedger
        });
      };
      const saveDiscussionLedgerArtifact = async () => {
        if (!discussionLedger) {
          return;
        }

        try {
          await this.storage.saveRunTextArtifact(
            request.projectSlug,
            runId,
            "discussion-ledger.md",
            buildDiscussionLedgerArtifact(discussionLedger)
          );
        } catch {
          // Keep ledger persistence best-effort so a save failure does not fail the run.
        }
      };
      const getNotionBriefForProfile = (profile: CompileContextProfile) =>
        notionBriefFull ? compressNotionBrief(notionBriefFull, profile) : "";

      if (trimmedContinuationNote) {
        userInterventions.push({ round: 0, text: trimmedContinuationNote });
        await emitContinuationMessage(trimmedContinuationNote);
      }

      let artifacts: RunArtifacts = {
        summary: "No summary was generated.",
        improvementPlan: "No improvement plan was generated.",
        revisedDraft: request.draft
      };
      let finalizedRealtimeDraft = false;
      let completedRounds = 0;

      if (request.reviewMode === "deepFeedback") {
        let currentDraft = request.draft;
        let cycle = 1;
        let latestArtifacts: RunArtifacts | undefined;

        while (true) {
          const compiledContextMarkdown = await buildCompiledContextMarkdown(currentDraft, cycle, "cycle", "full");
          const completedReviewerTurns = turns.filter((turn) => turn.status === "completed" && turn.role === "reviewer");
          const currentCycleReviewerTurns: ReviewTurn[] = [];

          for (const reviewer of [...activeReviewers]) {
            const state = stateMap.get(reviewer.providerId);
            if (!state) {
              continue;
            }

            const prompt = buildReviewerPrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("full"),
              completedReviewerTurns,
              cycle,
              reviewer.participantId,
              latestArtifacts,
              userInterventions,
              reviewer.perspective
            );
            const turn = await this.executeTurn(
              request.projectSlug,
              runId,
              reviewer,
              cycle,
              prompt,
              state,
              eventSink,
              `deep-cycle-${cycle}-reviewer`
            );

            turns.push(turn);
            if (turn.status === "completed") {
              currentCycleReviewerTurns.push(turn);
            }
            if (turn.status === "failed") {
              const index = activeReviewers.findIndex((participant) => participant.participantId === reviewer.participantId);
              if (index >= 0) {
                activeReviewers.splice(index, 1);
              }
              if (activeReviewers.length < 1) {
                throw new Error("The run cannot continue because every reviewer failed.");
              }
            }
          }

          const coordinatorPrompt = buildCoordinatorPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("full"),
            userInterventions,
            currentCycleReviewerTurns,
            latestArtifacts
          );
          const coordinatorTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            coordinator,
            cycle,
            coordinatorPrompt,
            coordinatorState,
            eventSink,
            `deep-cycle-${cycle}-coordinator`
          );
          turns.push(coordinatorTurn);

          if (coordinatorTurn.status !== "completed") {
            throw new Error(coordinatorTurn.error ?? "Coordinator failed to update the session.");
          }

          latestArtifacts = splitCoordinatorSections(coordinatorTurn.response, currentDraft);
          currentDraft = latestArtifacts.revisedDraft;
          await persistTurnsAndChat();
          await saveDeepArtifacts(latestArtifacts);

          completedRounds = cycle;
          run = await this.storage.updateRun(request.projectSlug, runId, {
            rounds: cycle
          });

          if (!interactiveMode) {
            if (cycle >= autoCycleLimit) {
              break;
            }
            cycle += 1;
            continue;
          }

          await eventSink({
            timestamp: nowIso(),
            type: "awaiting-user-input",
            round: cycle,
            message: `Cycle ${cycle} complete. Press Enter to continue, add a note for the next cycle, or type /done to stop.`
          });

          const intervention = (await requestUserIntervention?.({
            projectSlug: request.projectSlug,
            runId,
            round: cycle,
            reviewMode: request.reviewMode,
            coordinatorProvider: request.coordinatorProvider
          }))?.trim();

          if (intervention?.toLowerCase() === "/done" || intervention?.toLowerCase() === "/stop") {
            await eventSink({
              timestamp: nowIso(),
              type: "user-input-received",
              round: cycle,
              message: "Session marked complete."
            });
            break;
          }

          if (intervention) {
            await emitUserIntervention(cycle, intervention);
          }

          await eventSink({
            timestamp: nowIso(),
            type: "user-input-received",
            round: cycle,
            message: intervention ? "Next cycle guidance saved." : "Continuing to the next cycle."
          });
          cycle += 1;
        }

        artifacts = latestArtifacts ?? {
          summary: "No summary was generated.",
          improvementPlan: "No improvement plan was generated.",
          revisedDraft: currentDraft
        };
      } else {
        let currentDraft = request.draft;
        let round = 1;
        let seededCoordinatorTurn: ReviewTurn | undefined;

        const runRealtimeRedirectCoordinatorTurn = async (
          nextRound: number,
          compiledContextMarkdown: string,
          messages: string[]
        ): Promise<ReviewTurn> => {
          const redirectPrompt = buildRealtimeCoordinatorRedirectPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("compact"),
            userInterventions,
            turns.filter((turn) => turn.status === "completed"),
            nextRound,
            messages,
            discussionLedger
          );
          const redirectTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            coordinator,
            nextRound,
            redirectPrompt,
            coordinatorState,
            eventSink,
            `realtime-round-${nextRound}-coordinator-redirect`
          );
          turns.push(redirectTurn);
          if (redirectTurn.status !== "completed") {
            throw new Error(redirectTurn.error ?? "Coordinator failed to redirect the discussion.");
          }
          await updateDiscussionLedger(redirectTurn, extractDiscussionLedger(redirectTurn.response, nextRound));
          return redirectTurn;
        };

        roundLoop:
        while (true) {
          const compiledContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round", "compact");
          let coordinatorTurn = seededCoordinatorTurn;
          seededCoordinatorTurn = undefined;
          if (!coordinatorTurn) {
            const completedTurns = turns.filter((turn) => turn.status === "completed");
            const coordinatorPrompt = buildRealtimeCoordinatorDiscussionPrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("compact"),
              userInterventions,
              completedTurns,
              round,
              discussionLedger
            );
            coordinatorTurn = await this.executeTurn(
              request.projectSlug,
              runId,
              coordinator,
              round,
              coordinatorPrompt,
              coordinatorState,
              eventSink,
              `realtime-round-${round}-coordinator-open`
            );
            turns.push(coordinatorTurn);
          }

          if (coordinatorTurn.status !== "completed") {
            throw new Error(coordinatorTurn.error ?? "Coordinator failed to guide the realtime discussion.");
          }
          await updateDiscussionLedger(coordinatorTurn, extractDiscussionLedger(coordinatorTurn.response, round));

          let queuedMessages = consumeCurrentUserMessages();
          if (queuedMessages.length > 0) {
            await emitUserMessages(round, queuedMessages);
            round += 1;
            const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round", "compact");
            seededCoordinatorTurn = await runRealtimeRedirectCoordinatorTurn(round, redirectContextMarkdown, queuedMessages);
            await persistTurnsAndChat();
            continue;
          }

          const reviewerContextMarkdown = await buildCompiledContextMarkdown(
            currentDraft,
            round,
            "round",
            "minimal",
            { saveArtifact: false }
          );
          const currentRoundReviewerTurns: ReviewTurn[] = [];
          for (const reviewer of [...activeReviewers]) {
            const state = stateMap.get(reviewer.providerId);
            if (!state) {
              continue;
            }

            const prompt = buildRealtimeReviewerPrompt(
              reviewerContextMarkdown,
              getNotionBriefForProfile("minimal"),
              userInterventions,
              turns.filter((turn) => turn.status === "completed"),
              round,
              discussionLedger,
              reviewer.participantId,
              reviewer.perspective
            );
            const turn = await this.executeTurn(
              request.projectSlug,
              runId,
              reviewer,
              round,
              prompt,
              state,
              eventSink,
              `realtime-round-${round}-reviewer`
            );

            turns.push(turn);
            if (turn.status === "completed") {
              currentRoundReviewerTurns.push(turn);
            }
            if (turn.status === "failed") {
              const index = activeReviewers.findIndex((participant) => participant.participantId === reviewer.participantId);
              if (index >= 0) {
                activeReviewers.splice(index, 1);
              }
              if (activeReviewers.length < 1) {
                throw new Error("The run cannot continue because every reviewer failed.");
              }
            }

            queuedMessages = consumeCurrentUserMessages();
            if (queuedMessages.length > 0) {
              await emitUserMessages(round, queuedMessages);
              round += 1;
              const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round", "compact");
              seededCoordinatorTurn = await runRealtimeRedirectCoordinatorTurn(round, redirectContextMarkdown, queuedMessages);
              await persistTurnsAndChat();
              continue roundLoop;
            }
          }

          await persistTurnsAndChat();
          completedRounds = round;
          run = await this.storage.updateRun(request.projectSlug, runId, {
            rounds: round
          });

          const MIN_ROUNDS_BEFORE_CONSENSUS = 2;
          const reviewerStatuses = collectRealtimeReviewerStatuses(currentRoundReviewerTurns, activeReviewers);
          const unanimousApproval = hasRealtimeConsensus(activeReviewers, reviewerStatuses);
          const ledgerReadyForFinalDraft = hasResolvedOpenChallenges(discussionLedger);
          if (unanimousApproval && round < MIN_ROUNDS_BEFORE_CONSENSUS) {
            // 너무 이른 합의 — devil's advocate 발동
            const challengePrompt = buildDevilsAdvocatePrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("compact"),
              userInterventions,
              turns.filter((t) => t.status === "completed"),
              round,
              discussionLedger
            );
            const challengeTurn = await this.executeTurn(
              request.projectSlug,
              runId,
              coordinator,
              round,
              challengePrompt,
              coordinatorState,
              eventSink,
              `realtime-round-${round}-coordinator-challenge`
            );
            turns.push(challengeTurn);
            if (challengeTurn.status === "completed") {
              await updateDiscussionLedger(challengeTurn, extractDiscussionLedger(challengeTurn.response, round));
            }
            await persistTurnsAndChat();
            round += 1;
            continue;
          }

          if (unanimousApproval && ledgerReadyForFinalDraft) {
            const finalContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round", "full");
            const finalPrompt = buildRealtimeFinalDraftPrompt(
              finalContextMarkdown,
              getNotionBriefForProfile("full"),
              userInterventions,
              turns.filter((turn) => turn.status === "completed"),
              discussionLedger
            );
            const finalTurn = await this.executeTurn(
              request.projectSlug,
              runId,
              coordinator,
              round,
              finalPrompt,
              coordinatorState,
              eventSink,
              `realtime-round-${round}-coordinator-final`
            );
            turns.push(finalTurn);

            if (finalTurn.status !== "completed") {
              throw new Error(finalTurn.error ?? "Coordinator failed to write the final realtime draft.");
            }

            currentDraft = finalTurn.response.trim() || currentDraft;
            queuedMessages = consumeCurrentUserMessages();
            if (queuedMessages.length > 0) {
              await emitUserMessages(round, queuedMessages);
              round += 1;
              const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round", "compact");
              seededCoordinatorTurn = await runRealtimeRedirectCoordinatorTurn(round, redirectContextMarkdown, queuedMessages);
              await persistTurnsAndChat();
              continue;
            }

            finalizedRealtimeDraft = true;
            artifacts = {
              summary: "Realtime mode does not generate a summary artifact.",
              improvementPlan: "Realtime mode does not generate an improvement plan artifact.",
              revisedDraft: currentDraft
            };
            await persistTurnsAndChat();
            break;
          }

          if (round % 4 === 0) {
            await eventSink({
              timestamp: nowIso(),
              type: "awaiting-user-input",
              round,
              message: `Round ${round} ended without unanimous approval. Press Enter to continue, add guidance, or type /done to stop without a final draft.`
            });

            if (!requestUserIntervention) {
              throw new Error("Realtime discussion reached the safety limit without unanimous approval.");
            }

            const intervention = (await requestUserIntervention({
              projectSlug: request.projectSlug,
              runId,
              round,
              reviewMode: request.reviewMode,
              coordinatorProvider: request.coordinatorProvider
            }))?.trim();

            if (intervention?.toLowerCase() === "/done" || intervention?.toLowerCase() === "/stop") {
              await eventSink({
                timestamp: nowIso(),
                type: "user-input-received",
                round,
                message: "Realtime session marked complete without a final draft."
              });
              break;
            }

            if (intervention) {
              await emitUserIntervention(round, intervention);
            }

            await eventSink({
              timestamp: nowIso(),
              type: "user-input-received",
              round,
              message: intervention ? "Realtime guidance saved." : "Continuing realtime discussion."
            });
          }

          round += 1;
        }

        if (!finalizedRealtimeDraft) {
          artifacts = {
            summary: "Realtime mode does not generate a summary artifact.",
            improvementPlan: "Realtime mode does not generate an improvement plan artifact.",
            revisedDraft: currentDraft
          };
        }
      }

      await persistTurnsAndChat();
      if (request.reviewMode === "deepFeedback") {
        await saveDeepArtifacts(artifacts);
      } else if (finalizedRealtimeDraft) {
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "revised-draft.md", artifacts.revisedDraft);
      }
      if (request.reviewMode === "realtime") {
        await saveDiscussionLedgerArtifact();
      }

      run = await this.storage.updateRun(request.projectSlug, runId, {
        rounds: completedRounds,
        status: "completed",
        finishedAt: nowIso()
      });
      await eventSink({ timestamp: nowIso(), type: "run-completed", message: "Session completed" });

      return { run, turns, artifacts };
    } catch (error) {
      await this.storage.saveReviewTurns(request.projectSlug, runId, turns);
      if (chatMessages.size > 0) {
        await this.storage.saveRunChatMessages(request.projectSlug, runId, [...chatMessages.values()]);
      }
      if (request.reviewMode === "realtime") {
        try {
          if (discussionLedger) {
            await this.storage.saveRunTextArtifact(
              request.projectSlug,
              runId,
              "discussion-ledger.md",
              buildDiscussionLedgerArtifact(discussionLedger)
            );
          }
        } catch {
          // Preserve the original run failure if the ledger artifact cannot be written.
        }
      }
      run = await this.storage.updateRun(request.projectSlug, runId, {
        status: "failed",
        finishedAt: nowIso()
      });
      await eventSink({
        timestamp: nowIso(),
        type: "run-failed",
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async executeTurn(
    projectSlug: string,
    runId: string,
    participant: ReviewParticipant,
    round: number,
    prompt: BuiltPrompt,
    state: ProviderRuntimeState,
    onEvent?: (event: RunEvent) => Promise<void> | void,
    messageScope?: string
  ): Promise<ReviewTurn> {
    const startedAt = nowIso();
    const scopedMessageScope = `run-${runId}-${messageScope ?? `round-${round}-${participant.role}`}-${participant.participantId}`;
    const promptMetrics = finalizePromptMetrics(prompt);
    const turn: ReviewTurn = {
      providerId: participant.providerId,
      participantId: participant.participantId,
      participantLabel: participant.participantLabel,
      role: participant.role,
      round,
      prompt: prompt.text,
      promptMetrics,
      response: "",
      startedAt,
      status: "completed"
    };

    await this.recordEvent(projectSlug, runId, {
      timestamp: startedAt,
      type: "prompt-metrics",
      providerId: participant.providerId,
      participantId: participant.participantId,
      participantLabel: participant.participantLabel,
      round,
      speakerRole: participant.role,
      message: `${prompt.promptKind} prompt metrics recorded`,
      promptMetrics
    }, onEvent);
    await this.recordEvent(projectSlug, runId, {
      timestamp: startedAt,
      type: "turn-started",
      providerId: participant.providerId,
      participantId: participant.participantId,
      participantLabel: participant.participantLabel,
      round,
      speakerRole: participant.role,
      message: `${participant.role} turn started`,
      promptMetrics
    }, onEvent);

    try {
      const result = await this.gateway.execute(participant.providerId, prompt.text, {
        cwd: this.storage.storageRoot,
        authMode: state.authMode,
        apiKey: await this.gateway.getApiKey(participant.providerId),
        round,
        speakerRole: participant.role,
        messageScope: scopedMessageScope,
        participantId: participant.participantId,
        participantLabel: participant.participantLabel,
        onEvent
      });
      turn.response = result.text.trim();
      turn.finishedAt = nowIso();
      await this.recordEvent(projectSlug, runId, {
        timestamp: turn.finishedAt,
        type: "turn-completed",
        providerId: participant.providerId,
        participantId: participant.participantId,
        participantLabel: participant.participantLabel,
        round,
        speakerRole: participant.role,
        message: `${participant.role} turn completed`
      }, onEvent);
      return turn;
    } catch (error) {
      turn.status = "failed";
      turn.error = error instanceof Error ? error.message : String(error);
      turn.finishedAt = nowIso();
      await this.recordEvent(projectSlug, runId, {
        timestamp: turn.finishedAt,
        type: "turn-failed",
        providerId: participant.providerId,
        participantId: participant.participantId,
        participantLabel: participant.participantLabel,
        round,
        speakerRole: participant.role,
        message: turn.error
      }, onEvent);
      return turn;
    }
  }

  private async recordEvent(
    projectSlug: string,
    runId: string,
    event: RunEvent,
    onEvent?: (event: RunEvent) => Promise<void> | void
  ): Promise<void> {
    if (onEvent) {
      await onEvent(event);
      return;
    }

    await this.storage.appendRunEvent(projectSlug, runId, event);
  }
}

function applyChatEvent(messages: Map<string, RunChatMessage>, event: RunEvent): void {
  if (!event.type.startsWith("chat-message-") || !event.messageId) {
    return;
  }

  const existing = messages.get(event.messageId);
  const message =
    existing ??
    {
      id: event.messageId,
      providerId: event.providerId,
      participantId: event.participantId,
      participantLabel: event.participantLabel,
      speaker: chatSpeakerLabel(event),
      speakerRole: event.speakerRole ?? "system",
      recipient: event.recipient,
      round: event.round,
      content: "",
      startedAt: event.timestamp,
      status: "streaming" as const
    };

  if (event.type === "chat-message-started") {
    message.startedAt = event.timestamp;
  }

  if (event.type === "chat-message-delta" && event.message) {
    message.content += event.message;
  }

  if (event.type === "chat-message-completed") {
    message.finishedAt = event.timestamp;
    message.status = "completed";
  }

  messages.set(event.messageId, message);
}

function chatSpeakerLabel(event: RunEvent): string {
  if (event.speakerRole === "user") {
    return "You";
  }

  return event.participantLabel || providerLabel(event.providerId);
}

function providerLabel(providerId?: ProviderId): string {
  switch (providerId) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    default:
      return "System";
  }
}

function buildPrompt(options: {
  promptKind: PromptMetrics["promptKind"];
  contextProfile: CompileContextProfile;
  contextMarkdown: string;
  notionBrief?: string;
  historyBlocks?: string[];
  discussionLedgerBlock?: string;
  sections: Array<string | undefined>;
}): BuiltPrompt {
  return {
    text: options.sections.filter(Boolean).join("\n"),
    promptKind: options.promptKind,
    contextProfile: options.contextProfile,
    contextChars: options.contextMarkdown.length,
    historyChars: sumPromptBlockChars(options.historyBlocks),
    notionBriefChars: options.notionBrief?.trim().length ?? 0,
    discussionLedgerChars: options.discussionLedgerBlock?.length ?? 0
  };
}

function sumPromptBlockChars(blocks: Array<string | undefined> = []): number {
  return blocks.reduce((sum, block) => sum + (block?.length ?? 0), 0);
}

function finalizePromptMetrics(prompt: BuiltPrompt): PromptMetrics {
  return {
    promptKind: prompt.promptKind,
    contextProfile: prompt.contextProfile,
    promptChars: prompt.text.length,
    estimatedPromptTokens: Math.ceil(prompt.text.length / 4),
    contextChars: prompt.contextChars,
    historyChars: prompt.historyChars,
    notionBriefChars: prompt.notionBriefChars,
    discussionLedgerChars: prompt.discussionLedgerChars
  };
}

function buildReviewerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  allTurns: ReviewTurn[],
  round: number,
  currentParticipantId: string,
  latestArtifacts?: RunArtifacts,
  userInterventions: Array<{ round: number; text: string }> = [],
  perspective?: ReviewerPerspective
): BuiltPrompt {
  // 같은 라운드의 다른 리뷰어 응답은 보이지 않게 한다 — 독립 평가 보장
  const visibleTurns = allTurns.filter((turn) => {
    if (turn.round === round && turn.role === "reviewer" && turn.participantId !== currentParticipantId) {
      return false;
    }
    return true;
  });

  const previous = visibleTurns
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .slice(-4)
    .join("\n\n");
  const perspectiveInstruction = getPerspectiveInstruction(perspective);
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const previousBlock = previous ? "## Prior Reviewer Notes\n\n" + previous : "## Prior Reviewer Notes\n\n_No prior reviewer notes yet._";

  return buildPrompt({
    promptKind: "deep-reviewer",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, previousBlock],
    sections: [
    "You are an essay reviewer collaborating with other model reviewers.",
    buildStructuredKoreanResponseInstruction(),
    perspectiveInstruction,
    "Focus on improving a job application essay draft.",
    `Cycle: ${round}`,
    "Do not search Notion or browse external sources yourself. Use only the provided context and Notion Brief.",
    "Return Markdown with these sections:",
    "## Overall Verdict",
    "## Strengths",
    "## Problems",
    "## Suggestions",
    "## Direct Responses To Other Reviewers",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    previousBlock,
    "",
    "Prioritize concrete, evidence-based feedback tied to your assigned lens."
    ]
  });
}

function getPerspectiveInstruction(perspective?: ReviewerPerspective): string {
  switch (perspective) {
    case "technical":
      return [
        "Your assigned lens is TECHNICAL FIT.",
        "Focus on: whether the draft uses job-specific keywords correctly,",
        "whether technical claims have concrete evidence (numbers, architecture decisions, tools),",
        "and whether the experience genuinely maps to the target role's responsibilities.",
        "Do NOT comment on tone or emotional authenticity — another reviewer handles that."
      ].join(" ");
    case "interviewer":
      return [
        "Your assigned lens is INTERVIEWER SIMULATION.",
        "Read the draft as a hiring manager would.",
        "Focus on: what follow-up questions this draft would trigger,",
        "where the logic has gaps that an interviewer would probe,",
        "and whether the 'why this company / why this role' argument is convincing or generic.",
        "Do NOT focus on technical keyword density — another reviewer handles that."
      ].join(" ");
    case "authenticity":
      return [
        "Your assigned lens is AUTHENTICITY & VOICE.",
        "Focus on: whether the draft sounds like a real person or an AI template,",
        "whether emotions and growth narrative feel genuine,",
        "whether any sentence could be copy-pasted into a different company's application unchanged,",
        "and whether the writer's personality comes through.",
        "Do NOT focus on technical accuracy — another reviewer handles that."
      ].join(" ");
    default:
      return "";
  }
}

function buildCoordinatorPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  latestArtifacts?: RunArtifacts
): BuiltPrompt {
  const discussion = turns
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .join("\n\n");
  const discussionBlock = `## Reviewer Discussion For This Cycle\n${discussion}`;
  const interventionBlock = buildUserGuidanceBlock(userInterventions);
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const hasUserGuidance = userInterventions.length > 0;

  const sectionRequirements = hasUserGuidance
    ? [
        "## User Guidance Response",
        "  - For each user guidance item, state whether you ACCEPT or ADAPT it",
        "  - If ADAPT: explain what condition would make the user's direction work",
        "  - Never dismiss user guidance without proposing an alternative that preserves their intent",
        "## Summary",
        "## Improvement Plan",
        "## Revised Draft"
      ]
    : [
        "## Summary",
        "## Improvement Plan",
        "## Revised Draft"
      ];

  return buildPrompt({
    promptKind: "deep-coordinator",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, discussionBlock],
    sections: [
    "You are the coordinator for an ongoing multi-model essay feedback session.",
    buildStructuredKoreanResponseInstruction(),
    "Update the current session outputs using the latest reviewer discussion.",
    "Return Markdown with exactly these top-level sections:",
    ...sectionRequirements,
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    interventionBlock,
    interventionBlock ? "" : "",
    discussionBlock,
    "",
    "Keep the revised draft aligned with the latest voice and structure while fixing the highest-priority issues."
    ]
  });
}

function buildRealtimeCoordinatorDiscussionPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  ledger?: DiscussionLedger
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns, { maxTurns: 3, maxCharsPerTurn: 320 });
  const previousRoundBlock = buildPreviousRoundReviewerSummary(turns, round);
  const ledgerBlock = buildDiscussionLedgerBlock(ledger, "## Previous Discussion Ledger");
  const hasReviewerHistory = turns.some((turn) => turn.role === "reviewer" && turn.status === "completed" && turn.round > 0);

  return buildPrompt({
    promptKind: "realtime-coordinator-open",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "This turn is facilitation only. Do not write the full essay yet.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "Write Current Focus as one line, Target Section as a short label, and Mini Draft as a 2-4 sentence candidate rewrite for only that target section.",
    "Accepted Decisions and Open Challenges must use bullet items. If empty, write exactly '- 없음'.",
    hasReviewerHistory
      ? "Use the latest reviewer feedback and the previous ledger to move one unresolved issue closer to convergence."
      : "Open the discussion by naming the single highest-leverage issue and proposing the first Mini Draft.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildRealtimeCoordinatorRedirectPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  messages: string[],
  ledger?: DiscussionLedger
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns, { maxTurns: 3, maxCharsPerTurn: 320 });
  const previousRoundBlock = buildPreviousRoundReviewerSummary(turns, round);
  const ledgerBlock = buildDiscussionLedgerBlock(ledger, "## Previous Discussion Ledger");
  const userMessageBlock = [
    "## New User Messages",
    ...messages.map((message, index) => `### Message ${index + 1}\n${message}`)
  ].join("\n\n");

  return buildPrompt({
    promptKind: "realtime-coordinator-redirect",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, historyBlock, userMessageBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "The user just redirected the discussion. Reply first and reset the direction.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "Acknowledge the new user message by reflecting it inside Current Focus and Mini Draft.",
    "Accepted Decisions and Open Challenges must use bullet items. If empty, write exactly '- 없음'.",
    "Do not write the full essay yet.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock,
    "",
    userMessageBlock
    ]
  });
}

function buildRealtimeReviewerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  allTurns: ReviewTurn[],
  round: number,
  ledger: DiscussionLedger | undefined,
  currentParticipantId: string,
  perspective?: ReviewerPerspective
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  // 같은 라운드의 다른 리뷰어 응답은 보이지 않게 한다 — 독립 평가 보장
  const visibleTurns = allTurns.filter((turn) => {
    if (turn.round === round && turn.role === "reviewer" && turn.participantId !== currentParticipantId) {
      return false;
    }
    return true;
  });
  const historyBlock = buildRealtimeDiscussionHistory(
    visibleTurns.filter((turn) => turn.role !== "coordinator" || turn.round < round),
    { maxTurns: 2, maxCharsPerTurn: 220 }
  );
  const previousRoundBlock = buildPreviousRoundReviewerSummary(visibleTurns, round);
  const ledgerBlock = buildDiscussionLedgerBlock(ledger);
  const perspectiveInstruction = getPerspectiveInstruction(perspective);
  const crossFeedbackInstruction = round > 1
    ? 'Line 3 starts with "Cross-feedback:" and explicitly agree or disagree with exactly one objection from the previous-round reviewer summary.'
    : 'Line 3 starts with "Cross-feedback:" and state that there is no previous-round objection to react to yet.';

  return buildPrompt({
    promptKind: "realtime-reviewer",
    contextProfile: "minimal",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are a reviewer in a realtime multi-model essay discussion.",
    buildRealtimeKoreanResponseInstruction(),
    perspectiveInstruction,
    `Round: ${round}`,
    "Review the coordinator's current discussion ledger, especially the Mini Draft.",
    "Keep the blind review rule: do not assume anything about same-round reviewer replies that are not shown below.",
    "Respond in exactly 3 short labeled lines plus one final status line.",
    'Line 1 starts with "Mini Draft:" and identify one phrase or sentence in the Mini Draft to keep or revise.',
    'Line 2 starts with "Challenge:" and say whether one Open Challenge should be closed now or remain open.',
    crossFeedbackInstruction,
    "The final line must be exactly one of these:",
    "Status: APPROVE",
    "Status: REVISE",
    "Status: BLOCK",
    "Use APPROVE only if the Mini Draft direction is ready for a final rewrite and no Open Challenge should remain open.",
    "Do not use headings or bullet lists.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildRealtimeFinalDraftPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  ledger?: DiscussionLedger
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns, { maxTurns: 3, maxCharsPerTurn: 320 });
  const ledgerBlock = buildDiscussionLedgerBlock(ledger);

  return buildPrompt({
    promptKind: "realtime-final-draft",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator closing a realtime multi-model essay review session.",
    buildFinalEssayKoreanInstruction(),
    "Every active reviewer has approved the current direction and the remaining Open Challenges are resolved.",
    "Write the final polished essay draft now.",
    "Use the Mini Draft as the local seed, preserve the Accepted Decisions, and keep the final essay aligned with the resolved focus.",
    "Return only the rewritten essay in Markdown.",
    "Do not include section headings, status tags, summaries, or extra commentary.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildDevilsAdvocatePrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  ledger?: DiscussionLedger
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns, { maxTurns: 3, maxCharsPerTurn: 320 });
  const previousRoundBlock = buildPreviousRoundReviewerSummary(turns, round);
  const ledgerBlock = buildDiscussionLedgerBlock(ledger, "## Previous Discussion Ledger");

  return buildPrompt({
    promptKind: "realtime-coordinator-challenge",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "All reviewers agreed too quickly. This often means groupthink.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "Use this turn to challenge one assumption the reviewers accepted too quickly and add at least one concrete Open Challenge.",
    "Do not write the full essay.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildNotionPrePassPrompt(contextMarkdown: string, notionRequest: string): BuiltPrompt {
  return buildPrompt({
    promptKind: "notion-prepass",
    contextProfile: "minimal",
    contextMarkdown,
    sections: [
    "You are the coordinator for a multi-model essay feedback discussion.",
    buildNotionPrePassKoreanInstruction(),
    "Before the main review starts, use your configured Notion MCP tools to resolve the user's Notion request.",
    "Search for the most relevant Notion page or database entries, then summarize only the context that will improve the essay review.",
    "Prompt budget rules:",
    "- Use the explicit user request and the minimal draft excerpt below as your main anchor.",
    "- Search top 3 candidates or fewer.",
    "- Fetch at most 2 pages unless the request is still ambiguous after that.",
    "If the best match is clearly stronger than the next candidate, resolve it directly.",
    "If the result is ambiguous, do not hallucinate certainty. Briefly mention the top candidates and produce a conservative summary.",
    "If you cannot access Notion MCP or cannot resolve the request, say so clearly in the Resolution section.",
    "Return Markdown with exactly these top-level sections:",
    "## Resolution",
    "## Notion Brief",
    "## Sources Considered",
    "",
    contextMarkdown,
    "",
    "## User Notion Request",
    notionRequest
    ]
  });
}

function buildStructuredKoreanResponseInstruction(): string {
  return [
    "IMPORTANT: Write all substantive content in Korean (한국어).",
    "Keep the required English section headings exactly as written.",
    "Do not switch to English unless the user explicitly asks for it."
  ].join(" ");
}

function buildRealtimeKoreanResponseInstruction(): string {
  return [
    "IMPORTANT: Write your response sentences in Korean (한국어).",
    "Keep any required English status line exactly as written.",
    "Do not switch to English unless the user explicitly asks for it."
  ].join(" ");
}

function buildFinalEssayKoreanInstruction(): string {
  return "IMPORTANT: Write the final essay draft in Korean (한국어) unless the user explicitly asks for another language.";
}

function buildNotionPrePassKoreanInstruction(): string {
  return [
    "IMPORTANT: Write all substantive content in Korean (한국어).",
    "Keep the required English top-level section headings exactly as written.",
    "Do not switch to English unless the user explicitly asks for it."
  ].join(" ");
}

function buildDiscussionLedgerBlock(ledger?: DiscussionLedger, heading = "## Discussion Ledger"): string {
  if (!ledger) {
    return `${heading}\n\n_No discussion ledger yet._`;
  }

  return [
    heading,
    `- Updated At Round: ${ledger.updatedAtRound}`,
    `- Target Section: ${ledger.targetSection}`,
    "",
    "### Current Focus",
    ledger.currentFocus,
    "",
    "### Mini Draft",
    ledger.miniDraft,
    "",
    "### Accepted Decisions",
    ...formatDiscussionLedgerItems(ledger.acceptedDecisions),
    "",
    "### Open Challenges",
    ...formatDiscussionLedgerItems(ledger.openChallenges)
  ].join("\n");
}

function buildDiscussionLedgerArtifact(ledger: DiscussionLedger): string {
  return [
    "# Discussion Ledger",
    "",
    `- Updated At Round: ${ledger.updatedAtRound}`,
    `- Target Section: ${ledger.targetSection}`,
    "",
    "## Current Focus",
    ledger.currentFocus,
    "",
    "## Mini Draft",
    ledger.miniDraft,
    "",
    "## Accepted Decisions",
    ...formatDiscussionLedgerItems(ledger.acceptedDecisions),
    "",
    "## Open Challenges",
    ...formatDiscussionLedgerItems(ledger.openChallenges)
  ].join("\n");
}

function formatDiscussionLedgerItems(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- 없음"];
}

function extractDiscussionLedger(output: string, round: number): DiscussionLedger | undefined {
  const currentFocus = normalizeLedgerSingleLine(extractMarkdownSection(output, "Current Focus"));
  const targetSection = normalizeLedgerSingleLine(extractMarkdownSection(output, "Target Section"));
  const miniDraft = normalizeLedgerParagraph(extractMarkdownSection(output, "Mini Draft"));
  if (!currentFocus || !targetSection || !miniDraft) {
    return undefined;
  }

  return {
    currentFocus,
    miniDraft,
    acceptedDecisions: parseDiscussionLedgerItems(extractMarkdownSection(output, "Accepted Decisions")),
    openChallenges: parseDiscussionLedgerItems(extractMarkdownSection(output, "Open Challenges")),
    targetSection,
    updatedAtRound: round
  };
}

function normalizeLedgerSingleLine(section: string): string {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function normalizeLedgerParagraph(section: string): string {
  return section
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

function parseDiscussionLedgerItems(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^없음$/i.test(line));
}

function extractNotionBrief(response: string): string {
  const extracted = extractMarkdownSection(response, "Notion Brief");
  return extracted || response.trim();
}

function extractMarkdownSection(markdown: string, sectionTitle: string): string {
  const lines = markdown.split(/\r?\n/);
  const normalizedTitle = sectionTitle.trim().toLowerCase();
  const collected: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const headingTitle = heading[1].trim().toLowerCase();
      if (capturing) {
        break;
      }
      if (headingTitle === normalizedTitle) {
        capturing = true;
        continue;
      }
    }

    if (capturing) {
      collected.push(line);
    }
  }

  return collected.join("\n").trim();
}

function splitCoordinatorSections(output: string, fallbackDraft: string): RunArtifacts {
  const sections = new Map<string, string>();
  let current = "summary";
  sections.set(current, "");

  for (const line of output.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (normalized === "## summary" || normalized === "# summary") {
      current = "summary";
      sections.set(current, "");
      continue;
    }
    if (normalized === "## improvement plan" || normalized === "# improvement plan") {
      current = "improvementPlan";
      sections.set(current, "");
      continue;
    }
    if (normalized === "## revised draft" || normalized === "# revised draft") {
      current = "revisedDraft";
      sections.set(current, "");
      continue;
    }

    sections.set(current, `${sections.get(current) ?? ""}${line}\n`);
  }

  const summary = sections.get("summary")?.trim() || output.trim();
  const improvementPlan = sections.get("improvementPlan")?.trim() || "No structured improvement plan was returned.";
  const revisedDraft = sections.get("revisedDraft")?.trim() || fallbackDraft;

  return { summary, improvementPlan, revisedDraft };
}

function buildSessionSnapshotBlock(artifacts?: RunArtifacts): string {
  if (!artifacts) {
    return "";
  }

  return [
    "## Current Session Snapshot",
    `### Current Summary\n${artifacts.summary}`,
    `### Current Improvement Plan\n${artifacts.improvementPlan}`,
    `### Current Revised Draft\n${artifacts.revisedDraft}`
  ].join("\n\n");
}

function buildUserGuidanceBlock(userInterventions: Array<{ round: number; text: string }>, unitLabel = "cycle"): string {
  if (userInterventions.length === 0) {
    return "";
  }

  return [
    "## User Guidance",
    "IMPORTANT: The user (essay author) has provided direct guidance below.",
    "The user knows their own experience better than any reviewer.",
    "If the user disagrees with a reviewer consensus, explore HOW to make the user's preferred direction work rather than dismissing it.",
    "Only push back if the user's direction has a factual or logical problem that cannot be resolved by better writing.",
    "",
    ...userInterventions.slice(-6).map((item) =>
      item.round <= 0
        ? `### Before Start\n${item.text}`
        : `### After ${unitLabel} ${item.round}\n${item.text}`
    )
  ].join("\n\n");
}

function normalizeNotionRequest(request?: string): string | undefined {
  const trimmed = request?.trim();
  if (!trimmed) {
    return undefined;
  }

  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : undefined;
}

function compressNotionBrief(brief: string, profile: CompileContextProfile): string {
  const trimmed = brief.trim();
  if (!trimmed) {
    return "";
  }
  if (profile === "full") {
    return trimmed;
  }

  const maxItems = profile === "compact" ? 5 : 3;
  const maxChars = profile === "compact" ? 900 : 420;
  const maxItemChars = profile === "compact" ? 180 : 130;
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s+/, "").replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);

  const bullets: string[] = [];
  for (const line of lines) {
    const candidate = `- ${truncateContinuationText(line, maxItemChars)}`;
    if (bullets.length >= maxItems) {
      break;
    }
    if (sumPromptBlockChars([bullets.join("\n"), candidate]) > maxChars) {
      break;
    }
    if (!bullets.includes(candidate)) {
      bullets.push(candidate);
    }
  }

  if (bullets.length === 0) {
    return truncateContinuationText(trimmed, maxChars);
  }

  return bullets.join("\n");
}

function deriveImplicitNotionRequest(continuationNote?: string): string | undefined {
  const trimmed = normalizeNotionRequest(continuationNote);
  if (!trimmed) {
    return undefined;
  }

  return /(?:\bnotion\b|노션)/i.test(trimmed) ? trimmed : undefined;
}

function buildAutoNotionRequest(pageIds?: string[]): string | undefined {
  if (!pageIds || pageIds.length === 0) {
    return undefined;
  }

  return `Fetch these Notion pages and summarize relevant context: ${pageIds.join(", ")}`;
}

function buildRealtimeDiscussionHistory(
  turns: ReviewTurn[],
  options: { maxTurns?: number; maxCharsPerTurn?: number } = {}
): string {
  const maxTurns = Math.max(1, options.maxTurns ?? 3);
  const maxCharsPerTurn = Math.max(80, options.maxCharsPerTurn ?? 320);
  const relevant = turns
    .filter((turn) => turn.status === "completed" && turn.round > 0)
    .slice(-maxTurns);
  if (relevant.length === 0) {
    return "## Recent Discussion\n\n_No prior realtime discussion yet._";
  }

  return [
    "## Recent Discussion",
    ...relevant.map((turn) => `### ${turnLabel(turn)} round ${turn.round}\n${truncateContinuationText(turn.response, maxCharsPerTurn)}`)
  ].join("\n\n");
}

function buildPreviousRoundReviewerSummary(turns: ReviewTurn[], round: number): string {
  const previousRoundTurns = turns.filter(
    (turn) => turn.status === "completed" && turn.role === "reviewer" && turn.round === round - 1
  );
  if (previousRoundTurns.length === 0) {
    return "## Previous Round Reviewer Summary\n\n_No previous-round reviewer objections yet._";
  }

  return [
    "## Previous Round Reviewer Summary",
    ...previousRoundTurns.map((turn) => {
      const status = extractRealtimeReviewerStatus(turn.response);
      const objection = extractReviewerObjection(turn.response);
      return `- ${turnLabel(turn)}: ${truncateContinuationText(objection, 180)} (Status: ${status})`;
    })
  ].join("\n");
}

function extractReviewerObjection(response: string): string {
  const preferred = [
    extractMarkdownSection(response, "Problems"),
    extractMarkdownSection(response, "Suggestions"),
    response
  ];

  for (const block of preferred) {
    const line = block
      .split(/\r?\n/)
      .map((item) => item.trim())
      .map((item) => item.replace(/^[-*]\s+/, "").trim())
      .find((item) => item.length > 0 && !/^status:/i.test(item));
    if (line) {
      return line;
    }
  }

  return "핵심 objection이 명확히 드러나지 않았습니다.";
}

type RealtimeReviewerStatus = "APPROVE" | "REVISE" | "BLOCK";

function extractRealtimeReviewerStatus(response: string): RealtimeReviewerStatus {
  const matches = [...response.matchAll(/^\s*status:\s*(approve|revise|block)\s*$/gim)];
  if (matches.length === 0) {
    return "REVISE";
  }

  return matches[matches.length - 1][1].toUpperCase() as RealtimeReviewerStatus;
}

function collectRealtimeReviewerStatuses(
  turns: ReviewTurn[],
  activeReviewers: ReviewParticipant[]
): Map<string, RealtimeReviewerStatus> {
  const activeReviewerIds = new Set(activeReviewers.map((reviewer) => reviewer.participantId));
  const statuses = new Map<string, RealtimeReviewerStatus>();
  for (const turn of turns) {
    if (!turn.participantId || !activeReviewerIds.has(turn.participantId)) {
      continue;
    }

    statuses.set(turn.participantId, extractRealtimeReviewerStatus(turn.response));
  }

  return statuses;
}

function hasRealtimeConsensus(
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>
): boolean {
  return activeReviewers.length > 0 && activeReviewers.every((reviewer) => statuses.get(reviewer.participantId) === "APPROVE");
}

function hasResolvedOpenChallenges(ledger?: DiscussionLedger): boolean {
  return ledger !== undefined && ledger.openChallenges.length === 0;
}

function appendContinuationContext(
  contextMarkdown: string,
  continuationContext?: RunContinuationContext,
  continuationNote?: string
): string {
  const continuationBlock = buildContinuationBlock(continuationContext, continuationNote);
  if (!continuationBlock) {
    return contextMarkdown;
  }

  return [contextMarkdown, continuationBlock].filter(Boolean).join("\n\n");
}

function buildContinuationBlock(
  continuationContext?: RunContinuationContext,
  continuationNote?: string
): string {
  if (!continuationContext) {
    return continuationNote
      ? [
          "## Continuation Request",
          continuationNote
        ].join("\n\n")
      : "";
  }

  const sections = [
    "## Previous Run Context",
    `Continuing from run \`${continuationContext.record.id}\` started at ${continuationContext.record.startedAt}.`,
    continuationNote ? `### What To Continue Now\n${continuationNote}` : "",
    `### Previous Question\n${continuationContext.record.question}`,
    `### Previous Draft\n${continuationContext.record.draft}`,
    continuationContext.summary ? `### Previous Summary\n${continuationContext.summary}` : "",
    continuationContext.improvementPlan ? `### Previous Improvement Plan\n${continuationContext.improvementPlan}` : "",
    continuationContext.revisedDraft ? `### Previous Revised Draft\n${continuationContext.revisedDraft}` : "",
    continuationContext.notionBrief ? `### Previous Notion Brief\n${continuationContext.notionBrief}` : "",
    buildPreviousConversationHighlights(continuationContext.chatMessages)
  ].filter(Boolean);

  return sections.join("\n\n");
}

function buildPreviousConversationHighlights(messages?: RunChatMessage[]): string {
  if (!messages || messages.length === 0) {
    return "";
  }

  const relevant = messages
    .filter((message) => message.status === "completed" && message.speakerRole !== "system")
    .slice(-6);
  if (relevant.length === 0) {
    return "";
  }

  const lines = relevant.map((message) => {
    const subtitle = message.speakerRole === "user"
      ? "You"
      : `${message.speaker}${message.round !== undefined ? ` round ${message.round}` : ""}`;
    return `- ${subtitle}: ${truncateContinuationText(message.content, 280)}`;
  });

  return `### Previous Conversation Highlights\n${lines.join("\n")}`;
}

function turnLabel(turn: ReviewTurn): string {
  return turn.participantLabel || providerLabel(turn.providerId);
}

function buildCoordinatorParticipant(providerId: ProviderId): ReviewParticipant {
  return {
    participantId: "coordinator",
    participantLabel: `${providerLabel(providerId)} coordinator`,
    providerId,
    role: "coordinator"
  };
}

const REVIEWER_PERSPECTIVES: ReviewerPerspective[] = ["technical", "interviewer", "authenticity"];

function buildReviewerParticipants(providerIds: ProviderId[]): ReviewParticipant[] {
  const totals = new Map<ProviderId, number>();
  for (const providerId of providerIds) {
    totals.set(providerId, (totals.get(providerId) ?? 0) + 1);
  }

  const seen = new Map<ProviderId, number>();
  return providerIds.map((providerId, index) => {
    const next = (seen.get(providerId) ?? 0) + 1;
    seen.set(providerId, next);
    const duplicateCount = totals.get(providerId) ?? 1;
    const perspective = REVIEWER_PERSPECTIVES[index % REVIEWER_PERSPECTIVES.length];
    return {
      participantId: `reviewer-${index + 1}`,
      participantLabel: duplicateCount > 1 ? `${providerLabel(providerId)} reviewer ${next}` : `${providerLabel(providerId)} reviewer`,
      providerId,
      role: "reviewer",
      perspective
    };
  });
}

function truncateContinuationText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}
