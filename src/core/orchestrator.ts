import { ContextCompiler } from "./contextCompiler";
import { ForJobStorage, RunContinuationContext } from "./storage";
import {
  ProviderId,
  RunChatMessage,
  ProviderRuntimeState,
  ReviewMode,
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
      draft: request.draft
    });
    const trimmedContinuationNote = request.continuationNote?.trim() || undefined;
    const effectiveNotionRequest = request.notionRequest?.trim() || deriveImplicitNotionRequest(trimmedContinuationNote);
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
    let notionBrief = "";
    const userInterventions: Array<{ round: number; text: string }> = [];

    try {
      const coordinatorState = stateMap.get(coordinator.providerId);
      if (!coordinatorState) {
        throw new Error("Coordinator provider is unavailable.");
      }

      if (effectiveNotionRequest) {
        const notionPrompt = buildNotionPrePassPrompt(initialContextMarkdown, effectiveNotionRequest);
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

        notionBrief = extractNotionBrief(notionTurn.response);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "notion-brief.md", notionTurn.response);
        run = await this.storage.updateRun(request.projectSlug, runId, {
          notionBrief
        });
      }

      const interactiveMode = Boolean(requestUserIntervention);
      const autoCycleLimit = Math.max(1, request.rounds || 1);
      const persistTurnsAndChat = async () => {
        await this.storage.saveReviewTurns(request.projectSlug, runId, turns);
        if (chatMessages.size > 0) {
          await this.storage.saveRunChatMessages(request.projectSlug, runId, [...chatMessages.values()]);
        }
      };
      const saveDeepArtifacts = async (artifacts: RunArtifacts) => {
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "summary.md", artifacts.summary);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "improvement-plan.md", artifacts.improvementPlan);
        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "revised-draft.md", artifacts.revisedDraft);
      };
      const buildCompiledContextMarkdown = async (draft: string, round: number, unitLabel: "cycle" | "round") => {
        const compiled = await this.compiler.compile({
          project,
          profileDocuments,
          projectDocuments,
          selectedDocumentIds: request.selectedDocumentIds,
          question: request.question,
          draft
        });
        const compiledContextMarkdown = appendContinuationContext(
          compiled.markdown,
          continuationContext,
          trimmedContinuationNote
        );

        await this.storage.saveRunTextArtifact(request.projectSlug, runId, "compiled-context.md", compiledContextMarkdown);
        if (round > 1) {
          await eventSink({
            timestamp: nowIso(),
            type: "compiled-context",
            round,
            message: `Compiled context refreshed for ${unitLabel} ${round}`
          });
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
          const compiledContextMarkdown = await buildCompiledContextMarkdown(currentDraft, cycle, "cycle");
          const completedReviewerTurns = turns.filter((turn) => turn.status === "completed" && turn.role === "reviewer");
          const currentCycleReviewerTurns: ReviewTurn[] = [];

          for (const reviewer of [...activeReviewers]) {
            const state = stateMap.get(reviewer.providerId);
            if (!state) {
              continue;
            }

            const prompt = buildReviewerPrompt(
              compiledContextMarkdown,
              notionBrief,
              completedReviewerTurns,
              cycle,
              latestArtifacts,
              userInterventions
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
            notionBrief,
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
            notionBrief,
            userInterventions,
            turns.filter((turn) => turn.status === "completed"),
            nextRound,
            messages
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
          return redirectTurn;
        };

        roundLoop:
        while (true) {
          const compiledContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round");
          let coordinatorTurn = seededCoordinatorTurn;
          seededCoordinatorTurn = undefined;
          if (!coordinatorTurn) {
            const completedTurns = turns.filter((turn) => turn.status === "completed");
            const coordinatorPrompt = buildRealtimeCoordinatorDiscussionPrompt(
              compiledContextMarkdown,
              notionBrief,
              userInterventions,
              completedTurns,
              round
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

          let queuedMessages = consumeCurrentUserMessages();
          if (queuedMessages.length > 0) {
            await emitUserMessages(round, queuedMessages);
            round += 1;
            const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round");
            seededCoordinatorTurn = await runRealtimeRedirectCoordinatorTurn(round, redirectContextMarkdown, queuedMessages);
            await persistTurnsAndChat();
            continue;
          }

          const currentRoundReviewerTurns: ReviewTurn[] = [];
          for (const reviewer of [...activeReviewers]) {
            const state = stateMap.get(reviewer.providerId);
            if (!state) {
              continue;
            }

            const prompt = buildRealtimeReviewerPrompt(
              compiledContextMarkdown,
              notionBrief,
              userInterventions,
              turns.filter((turn) => turn.status === "completed"),
              round,
              coordinatorTurn.response
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
              const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round");
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

          const reviewerStatuses = collectRealtimeReviewerStatuses(currentRoundReviewerTurns, activeReviewers);
          if (hasRealtimeConsensus(activeReviewers, reviewerStatuses)) {
            const finalPrompt = buildRealtimeFinalDraftPrompt(
              compiledContextMarkdown,
              notionBrief,
              userInterventions,
              turns.filter((turn) => turn.status === "completed")
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
              const redirectContextMarkdown = await buildCompiledContextMarkdown(currentDraft, round, "round");
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
    prompt: string,
    state: ProviderRuntimeState,
    onEvent?: (event: RunEvent) => Promise<void> | void,
    messageScope?: string
  ): Promise<ReviewTurn> {
    const startedAt = nowIso();
    const scopedMessageScope = `run-${runId}-${messageScope ?? `round-${round}-${participant.role}`}-${participant.participantId}`;
    const turn: ReviewTurn = {
      providerId: participant.providerId,
      participantId: participant.participantId,
      participantLabel: participant.participantLabel,
      role: participant.role,
      round,
      prompt,
      response: "",
      startedAt,
      status: "completed"
    };

      await this.recordEvent(projectSlug, runId, {
        timestamp: startedAt,
        type: "turn-started",
        providerId: participant.providerId,
        participantId: participant.participantId,
        participantLabel: participant.participantLabel,
        round,
        speakerRole: participant.role,
        message: `${participant.role} turn started`
      }, onEvent);

    try {
      const result = await this.gateway.execute(participant.providerId, prompt, {
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

function buildReviewerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  turns: ReviewTurn[],
  round: number,
  latestArtifacts?: RunArtifacts,
  userInterventions: Array<{ round: number; text: string }> = []
): string {
  const previous = turns
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .slice(-4)
    .join("\n\n");
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);

  return [
    "You are an essay reviewer collaborating with other model reviewers.",
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
    previous ? "## Prior Reviewer Notes\n\n" + previous : "## Prior Reviewer Notes\n\n_No prior reviewer notes yet._",
    "",
    "Prioritize concrete, evidence-based feedback tied to the rubric."
  ].filter(Boolean).join("\n");
}

function buildCoordinatorPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  latestArtifacts?: RunArtifacts
): string {
  const discussion = turns
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .join("\n\n");
  const interventionBlock = buildUserGuidanceBlock(userInterventions);
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);

  return [
    "You are the coordinator for an ongoing multi-model essay feedback session.",
    "Update the current session outputs using the latest reviewer discussion.",
    "Return Markdown with exactly these top-level sections:",
    "## Summary",
    "## Improvement Plan",
    "## Revised Draft",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    interventionBlock,
    interventionBlock ? "" : "",
    "## Reviewer Discussion For This Cycle",
    discussion,
    "",
    "Keep the revised draft aligned with the latest voice and structure while fixing the highest-priority issues."
  ].filter(Boolean).join("\n");
}

function buildRealtimeCoordinatorDiscussionPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number
): string {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns);
  const hasReviewerHistory = turns.some((turn) => turn.role === "reviewer" && turn.status === "completed" && turn.round > 0);

  return [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    `Round: ${round}`,
    "This turn is facilitation only. Do not write the full essay yet.",
    "Respond in plain Markdown with at most 3 short sentences.",
    hasReviewerHistory
      ? "Use the latest reviewer feedback to propose the single highest-leverage next change."
      : "Open the discussion by naming the single highest-leverage issue and asking reviewers to react.",
    "Do not use section headings, bullet lists, or status tags.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
  ].filter(Boolean).join("\n");
}

function buildRealtimeCoordinatorRedirectPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  messages: string[]
): string {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns);
  const userMessageBlock = [
    "## New User Messages",
    ...messages.map((message, index) => `### Message ${index + 1}\n${message}`)
  ].join("\n\n");

  return [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    `Round: ${round}`,
    "The user just redirected the discussion. Reply first and reset the direction.",
    "Respond in plain Markdown with at most 3 short sentences.",
    "Acknowledge the new user message, state the new focus, and give reviewers one specific thing to react to next.",
    "Do not write the full essay yet.",
    "Do not use section headings, bullet lists, or status tags in your response.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock,
    "",
    userMessageBlock
  ].filter(Boolean).join("\n");
}

function buildRealtimeReviewerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  coordinatorMessage: string
): string {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns.filter((turn) => turn.role !== "coordinator" || turn.round < round));

  return [
    "You are a reviewer in a realtime multi-model essay discussion.",
    `Round: ${round}`,
    "Respond directly to the coordinator's latest proposal.",
    "Use at most 2 short sentences, then end with exactly one final status line.",
    "The final line must be exactly one of these:",
    "Status: APPROVE",
    "Status: REVISE",
    "Status: BLOCK",
    "Use APPROVE only if the latest direction is ready for a final rewrite. If unsure, use REVISE.",
    "Do not use headings or bullet lists.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock,
    "",
    "## Coordinator Note",
    coordinatorMessage
  ].filter(Boolean).join("\n");
}

function buildRealtimeFinalDraftPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[]
): string {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns);

  return [
    "You are the coordinator closing a realtime multi-model essay review session.",
    "Every active reviewer has approved the current direction.",
    "Write the final polished essay draft now.",
    "Return only the rewritten essay in Markdown.",
    "Do not include section headings, status tags, summaries, or extra commentary.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
  ].filter(Boolean).join("\n");
}

function buildNotionPrePassPrompt(contextMarkdown: string, notionRequest: string): string {
  return [
    "You are the coordinator for a multi-model essay feedback discussion.",
    "Before the main review starts, use your configured Notion MCP tools to resolve the user's Notion request.",
    "Search for the most relevant Notion page or database entries, then summarize only the context that will improve the essay review.",
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
  ].join("\n");
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
    ...userInterventions.slice(-6).map((item) =>
      item.round <= 0
        ? `### Before Start\n${item.text}`
        : `### After ${unitLabel} ${item.round}\n${item.text}`
    )
  ].join("\n\n");
}

function deriveImplicitNotionRequest(continuationNote?: string): string | undefined {
  const trimmed = continuationNote?.trim();
  if (!trimmed) {
    return undefined;
  }

  return /(?:\bnotion\b|노션)/i.test(trimmed) ? trimmed : undefined;
}

function buildRealtimeDiscussionHistory(turns: ReviewTurn[]): string {
  const relevant = turns
    .filter((turn) => turn.status === "completed" && turn.round > 0)
    .slice(-8);
  if (relevant.length === 0) {
    return "## Recent Discussion\n\n_No prior realtime discussion yet._";
  }

  return [
    "## Recent Discussion",
    ...relevant.map((turn) => `### ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
  ].join("\n\n");
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
    return {
      participantId: `reviewer-${index + 1}`,
      participantLabel: duplicateCount > 1 ? `${providerLabel(providerId)} reviewer ${next}` : `${providerLabel(providerId)} reviewer`,
      providerId,
      role: "reviewer"
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
