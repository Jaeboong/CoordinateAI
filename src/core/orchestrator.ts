import { ContextCompiler } from "./contextCompiler";
import { resolveRoleAssignments } from "./roleAssignments";
import { ForJobStorage, RunContinuationContext } from "./storage";
import {
  ChallengeSeverity,
  ChallengeSource,
  ChallengeStatus,
  ChallengeTicket,
  CompileContextProfile,
  DiscussionLedger,
  EssayRoleId,
  essayRoleIds,
  ProviderId,
  PromptMetrics,
  RunChatMessage,
  ProviderRuntimeState,
  ReviewMode,
  ReviewerPerspective,
  RoleAssignment,
  ReviewTurn,
  RunArtifacts,
  RunEvent,
  RunRequest,
  RunRecord,
  SectionOutcome
} from "./types";
import { createId, nowIso } from "./utils";

interface ReviewParticipant {
  participantId: string;
  participantLabel: string;
  providerId: ProviderId;
  role: ReviewTurn["role"];
  assignment: RoleAssignment;
  roleId?: EssayRoleId;
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
      modelOverride?: string;
      effortOverride?: string;
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

type NotionRequestKind = "explicit" | "implicit" | "auto";

interface NotionRequestDescriptor {
  text: string;
  kind: NotionRequestKind;
}

interface SectionBrief {
  currentSection: string;
  currentObjective: string;
  mustKeep: string[];
  mustResolve: string[];
  availableEvidence: string[];
  exitCriteria: string[];
  nextOwner: string;
}

interface SectionDraftResult {
  sectionDraft: string;
  changeRationale: string;
}

interface RealtimeReferencePacket {
  refId: string;
  sourceLabel: string;
  summary: string;
}

interface ParsedChallengeDecision {
  ticketId: string;
  action: "close" | "keep-open" | "defer" | "promote";
}

interface ParsedChallengeAddDecision {
  ticketId: "new";
  action: "add";
  sectionKey?: string;
  sectionLabel?: string;
  severity?: ChallengeSeverity;
  text?: string;
}

interface ParsedReviewerChallengeVerdict {
  ticketId: string;
  action: "close" | "keep-open" | "defer";
  reason: string;
}

interface ChallengeTicketCluster {
  sectionKey: string;
  sectionLabel: string;
  tickets: ChallengeTicket[];
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
    const resolvedRoles = resolveRoleAssignments(request.roleAssignments, request.coordinatorProvider, request.reviewerProviders);
    const researcher = buildResearchParticipant(resolvedRoles.byRole.context_researcher);
    const coordinator = buildCoordinatorParticipant(resolvedRoles.byRole.section_coordinator);
    const drafter = buildDrafterParticipant(resolvedRoles.byRole.section_drafter);
    const finalizer = buildFinalizerParticipant(resolvedRoles.byRole.finalizer);
    const requestedReviewers = buildReviewerParticipants(resolvedRoles.byRole);
    if (requestedReviewers.length < 1) {
      throw new Error("At least one reviewer is required to run a review.");
    }

    const selectedProviders = [...new Set(resolvedRoles.all.map((assignment) => assignment.providerId))];
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
    const notionRequestDescriptor = resolveNotionRequestDescriptor(
      request.notionRequest,
      trimmedContinuationNote,
      project.notionPageIds
    );
    const effectiveNotionRequest = notionRequestDescriptor?.text;
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
      roleAssignments: resolvedRoles.all,
      coordinatorProvider: coordinator.providerId,
      reviewerProviders: requestedReviewers.map((reviewer) => reviewer.providerId),
      continuationFromRunId: request.continuationFromRunId?.trim() || undefined,
      continuationNote: trimmedContinuationNote,
      rounds: 0,
      selectedDocumentIds: request.selectedDocumentIds,
      status: "running",
      startedAt: nowIso()
    };

    await this.storage.createRun(run);
    await this.storage.setLastCoordinatorProvider(coordinator.providerId);
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
    const polishRoundsUsed = new Set<string>();

    try {
      const coordinatorState = stateMap.get(coordinator.providerId);
      if (!coordinatorState) {
        throw new Error("Coordinator provider is unavailable.");
      }
      const researcherState = stateMap.get(researcher.providerId);
      const drafterState = stateMap.get(drafter.providerId);
      const finalizerState = stateMap.get(finalizer.providerId);

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
        const notionPrompt = buildNotionPrePassPrompt(notionContextMarkdown, notionRequestDescriptor);
        const notionTurn = await this.executeTurn(
          request.projectSlug,
          runId,
          researcher,
          0,
          notionPrompt,
          researcherState ?? coordinatorState,
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
        if (artifacts.finalChecks?.trim()) {
          await this.storage.saveRunTextArtifact(request.projectSlug, runId, "final-checks.md", artifacts.finalChecks);
        }
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
          const coordinatorPrompt = buildDeepSectionCoordinatorPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("full"),
            userInterventions,
            latestArtifacts,
            turns.filter((turn) => turn.status === "completed")
          );
          const coordinatorBriefTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            coordinator,
            cycle,
            coordinatorPrompt,
            coordinatorState,
            eventSink,
            `deep-cycle-${cycle}-coordinator-brief`
          );
          turns.push(coordinatorBriefTurn);

          if (coordinatorBriefTurn.status !== "completed") {
            throw new Error(coordinatorBriefTurn.error ?? "Coordinator failed to prepare the section brief.");
          }

          const sectionBrief = splitSectionCoordinationBrief(coordinatorBriefTurn.response);
          const drafterPrompt = buildSectionDrafterPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("full"),
            userInterventions,
            sectionBrief,
            latestArtifacts
          );
          const drafterTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            drafter,
            cycle,
            drafterPrompt,
            drafterState ?? coordinatorState,
            eventSink,
            `deep-cycle-${cycle}-drafter`
          );
          turns.push(drafterTurn);
          if (drafterTurn.status !== "completed") {
            throw new Error(drafterTurn.error ?? "Section drafter failed to write the section draft.");
          }
          const draftOutput = splitSectionDraftOutput(drafterTurn.response, currentDraft);
          const currentCycleReviewerTurns: ReviewTurn[] = [];

          for (const reviewer of [...activeReviewers]) {
            const state = stateMap.get(reviewer.providerId);
            if (!state) {
              continue;
            }

            const prompt = buildDeepReviewerPrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("full"),
              completedReviewerTurns,
              cycle,
              reviewer.participantId,
              latestArtifacts,
              userInterventions,
              reviewer.perspective,
              sectionBrief,
              draftOutput
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

          const coordinatorDecisionPrompt = buildDeepCoordinatorDecisionPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("full"),
            userInterventions,
            currentCycleReviewerTurns,
            latestArtifacts,
            sectionBrief,
            draftOutput
          );
          const coordinatorDecisionTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            coordinator,
            cycle,
            coordinatorDecisionPrompt,
            coordinatorState,
            eventSink,
            `deep-cycle-${cycle}-coordinator-decision`
          );
          turns.push(coordinatorDecisionTurn);

          if (coordinatorDecisionTurn.status !== "completed") {
            throw new Error(coordinatorDecisionTurn.error ?? "Coordinator failed to decide the next owner.");
          }

          const coordinatorDecision = splitCoordinatorDecisionOutput(coordinatorDecisionTurn.response);
          const finalizerPrompt = buildDeepFinalizerPrompt(
            compiledContextMarkdown,
            getNotionBriefForProfile("full"),
            userInterventions,
            latestArtifacts,
            sectionBrief,
            draftOutput,
            currentCycleReviewerTurns,
            coordinatorDecision
          );
          const finalizerTurn = await this.executeTurn(
            request.projectSlug,
            runId,
            finalizer,
            cycle,
            finalizerPrompt,
            finalizerState ?? coordinatorState,
            eventSink,
            `deep-cycle-${cycle}-finalizer`
          );
          turns.push(finalizerTurn);

          if (finalizerTurn.status !== "completed") {
            throw new Error(finalizerTurn.error ?? "Finalizer failed to update the session.");
          }

          const finalizerOutput = splitFinalizerOutput(finalizerTurn.response, currentDraft);
          latestArtifacts = {
            summary: coordinatorDecision.summary,
            improvementPlan: coordinatorDecision.improvementPlan,
            revisedDraft: finalizerOutput.finalDraft,
            finalChecks: finalizerOutput.finalChecks
          };
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
              coordinatorProvider: coordinator.providerId
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
          if (discussionLedger) {
            const drafterPrompt = buildRealtimeSectionDrafterPrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("compact"),
              userInterventions,
              turns.filter((turn) => turn.status === "completed"),
              round,
              discussionLedger
            );
            const drafterTurn = await this.executeTurn(
              request.projectSlug,
              runId,
              drafter,
              round,
              drafterPrompt,
              drafterState ?? coordinatorState,
              eventSink,
              `realtime-round-${round}-drafter`
            );
            turns.push(drafterTurn);
            if (drafterTurn.status === "completed") {
              const sectionDraft = extractSectionDraft(drafterTurn.response);
              discussionLedger = {
                ...discussionLedger,
                miniDraft: sectionDraft?.sectionDraft || discussionLedger.miniDraft,
                sectionDraft: sectionDraft?.sectionDraft || discussionLedger.sectionDraft,
                changeRationale: sectionDraft?.changeRationale || discussionLedger.changeRationale,
                nextOwner: "fit_reviewer",
                updatedAtRound: round
              };
              await eventSink({
                timestamp: nowIso(),
                type: "discussion-ledger-updated",
                providerId: drafter.providerId,
                participantId: drafter.participantId,
                participantLabel: drafter.participantLabel,
                round,
                speakerRole: drafter.role,
                message: `Section draft prepared for ${discussionLedger.targetSection}`,
                discussionLedger
              });
            }
          }

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
          const allReviewersApprove = hasAllApprovingRealtimeReviewers(activeReviewers, reviewerStatuses);
          const currentSectionReady = isCurrentSectionReady(discussionLedger, activeReviewers, reviewerStatuses);
          const wholeDocumentReady = isWholeDocumentReady(discussionLedger, activeReviewers, reviewerStatuses);
          const nextCluster = pickNextTargetSectionCluster(discussionLedger);
          const effectiveSectionOutcome = validateSectionOutcome(discussionLedger?.sectionOutcome, {
            currentSectionReady,
            wholeDocumentReady,
            hasNextCluster: Boolean(nextCluster)
          });
          const currentSectionKey = getLedgerTargetSectionKey(discussionLedger);
          if (allReviewersApprove && round < MIN_ROUNDS_BEFORE_CONSENSUS) {
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

          if (
            discussionLedger &&
            currentSectionReady &&
            shouldRunWeakConsensusPolish(activeReviewers, reviewerStatuses, currentSectionKey, polishRoundsUsed)
          ) {
            polishRoundsUsed.add(currentSectionKey);
            const polishPrompt = buildWeakConsensusPolishPrompt(
              compiledContextMarkdown,
              getNotionBriefForProfile("compact"),
              userInterventions,
              turns.filter((turn) => turn.status === "completed"),
              round,
              discussionLedger
            );
            const polishTurn = await this.executeTurn(
              request.projectSlug,
              runId,
              coordinator,
              round,
              polishPrompt,
              coordinatorState,
              eventSink,
              `realtime-round-${round}-coordinator-polish`
            );
            turns.push(polishTurn);
            if (polishTurn.status === "completed") {
              await updateDiscussionLedger(polishTurn, extractDiscussionLedger(polishTurn.response, round));
            }
            await persistTurnsAndChat();
            round += 1;
            continue;
          }

          if (effectiveSectionOutcome === "write-final" && wholeDocumentReady) {
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
              finalizer,
              round,
              finalPrompt,
              finalizerState ?? coordinatorState,
              eventSink,
              `realtime-round-${round}-finalizer-final`
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

          if (effectiveSectionOutcome === "handoff-next-section" && discussionLedger && nextCluster) {
            discussionLedger = transitionDiscussionLedgerToNextCluster(discussionLedger, nextCluster, round);
            await eventSink({
              timestamp: nowIso(),
              type: "discussion-ledger-updated",
              round,
              speakerRole: "system",
              message: `Prepared the next target section handoff: ${nextCluster.sectionLabel}`,
              discussionLedger
            });
            round += 1;
            continue;
          }

          if (round % 4 === 0) {
            await eventSink({
              timestamp: nowIso(),
              type: "awaiting-user-input",
              round,
              message: `Round ${round} ended without a document-ready conclusion. Press Enter to continue, add guidance, or type /done to stop without a final draft.`
            });

            if (!requestUserIntervention) {
              throw new Error("Realtime discussion reached the safety limit without a document-ready conclusion.");
            }

            const intervention = (await requestUserIntervention({
              projectSlug: request.projectSlug,
              runId,
              round,
              reviewMode: request.reviewMode,
              coordinatorProvider: coordinator.providerId
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
        modelOverride: participant.assignment.useProviderDefaults ? undefined : participant.assignment.modelOverride,
        effortOverride: participant.assignment.useProviderDefaults ? undefined : participant.assignment.effortOverride,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

interface SectionCoordinationBrief {
  currentSection: string;
  currentObjective: string;
  rewriteDirection: string;
  mustKeep: string[];
  mustResolve: string[];
  availableEvidence: string[];
  exitCriteria: string[];
  nextOwner: EssayRoleId;
}

interface SectionDraftOutput {
  sectionDraft: string;
  changeRationale: string;
}

interface CoordinatorDecisionOutput {
  summary: string;
  improvementPlan: string;
  nextOwner?: EssayRoleId;
}

interface FinalizerOutput {
  finalDraft: string;
  finalChecks?: string;
}

function normalizeEssayRoleId(raw: string, fallback: EssayRoleId): EssayRoleId {
  const normalized = normalizeLedgerSingleLine(raw) as EssayRoleId;
  return essayRoleIds.includes(normalized) ? normalized : fallback;
}

function splitSectionCoordinationBrief(output: string): SectionCoordinationBrief {
  const currentSection = normalizeLedgerSingleLine(extractMarkdownSection(output, "Current Section"))
    || normalizeLedgerSingleLine(extractMarkdownSection(output, "Target Section"))
    || "핵심 문단";
  const currentObjective = normalizeLedgerParagraph(extractMarkdownSection(output, "Current Objective"))
    || normalizeLedgerSingleLine(extractMarkdownSection(output, "Current Focus"))
    || "현재 section의 설득력을 높일 것";
  const rewriteDirection = normalizeLedgerParagraph(extractMarkdownSection(output, "Rewrite Direction"))
    || normalizeLedgerParagraph(extractMarkdownSection(output, "Mini Draft"))
    || currentObjective;

  return {
    currentSection,
    currentObjective,
    rewriteDirection,
    mustKeep: parseDiscussionLedgerItems(extractMarkdownSection(output, "Must Keep")),
    mustResolve: parseDiscussionLedgerItems(extractMarkdownSection(output, "Must Resolve")),
    availableEvidence: parseDiscussionLedgerItems(extractMarkdownSection(output, "Available Evidence")),
    exitCriteria: parseDiscussionLedgerItems(extractMarkdownSection(output, "Exit Criteria")),
    nextOwner: normalizeEssayRoleId(extractMarkdownSection(output, "Next Owner"), "section_drafter")
  };
}

function splitSectionDraftOutput(output: string, fallbackDraft: string): SectionDraftOutput {
  const sectionDraft = normalizeLedgerParagraph(extractMarkdownSection(output, "Section Draft")) || output.trim() || fallbackDraft;
  const changeRationale = normalizeLedgerParagraph(extractMarkdownSection(output, "Change Rationale"));
  return {
    sectionDraft,
    changeRationale
  };
}

function extractSectionDraft(output: string): SectionDraftOutput | undefined {
  const sectionDraft = normalizeLedgerParagraph(extractMarkdownSection(output, "Section Draft"));
  if (!sectionDraft) {
    return undefined;
  }

  return {
    sectionDraft,
    changeRationale: normalizeLedgerParagraph(extractMarkdownSection(output, "Change Rationale"))
  };
}

function splitCoordinatorDecisionOutput(output: string): CoordinatorDecisionOutput {
  return {
    summary: extractMarkdownSection(output, "Summary") || output.trim(),
    improvementPlan: extractMarkdownSection(output, "Improvement Plan") || "구조화된 개선안이 반환되지 않았습니다.",
    nextOwner: normalizeLedgerSingleLine(extractMarkdownSection(output, "Next Owner"))
      ? normalizeEssayRoleId(extractMarkdownSection(output, "Next Owner"), "finalizer")
      : undefined
  };
}

function splitFinalizerOutput(output: string, fallbackDraft: string): FinalizerOutput {
  const finalDraft = extractMarkdownSection(output, "Final Draft") || output.trim() || fallbackDraft;
  const finalChecks = extractMarkdownSection(output, "Final Checks") || undefined;
  return {
    finalDraft,
    finalChecks
  };
}

function buildSectionCoordinationBriefBlock(brief: SectionCoordinationBrief, heading = "## Current Section Brief"): string {
  return [
    heading,
    `### Current Section\n${brief.currentSection}`,
    `### Current Objective\n${brief.currentObjective}`,
    `### Rewrite Direction\n${brief.rewriteDirection}`,
    "### Must Keep",
    ...formatDiscussionLedgerItems(brief.mustKeep),
    "",
    "### Must Resolve",
    ...formatDiscussionLedgerItems(brief.mustResolve),
    "",
    "### Available Evidence",
    ...formatDiscussionLedgerItems(brief.availableEvidence),
    "",
    "### Exit Criteria",
    ...formatDiscussionLedgerItems(brief.exitCriteria),
    "",
    `### Next Owner\n${brief.nextOwner}`
  ].join("\n");
}

function buildSectionDraftBlock(sectionDraft: string, changeRationale?: string, heading = "## Current Section Draft"): string {
  return [
    heading,
    sectionDraft,
    changeRationale
      ? `\n## Change Rationale\n${changeRationale}`
      : ""
  ].filter(Boolean).join("\n\n");
}

function buildReviewerDecisionBlock(turns: ReviewTurn[], heading = "## Reviewer Judgments"): string {
  if (turns.length === 0) {
    return `${heading}\n\n_No reviewer judgments yet._`;
  }

  return [
    heading,
    ...turns.map((turn) => `### ${turnLabel(turn)}\n${turn.response}`)
  ].join("\n\n");
}

function buildCoordinatorDecisionBlock(decision: CoordinatorDecisionOutput, heading = "## Coordinator Decision"): string {
  return [
    heading,
    `### Summary\n${decision.summary}`,
    `### Improvement Plan\n${decision.improvementPlan}`,
    decision.nextOwner ? `### Next Owner\n${decision.nextOwner}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildDeepSectionCoordinatorPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  latestArtifacts?: RunArtifacts,
  turns: ReviewTurn[] = []
): BuiltPrompt {
  const previous = turns
    .filter((turn) => turn.status === "completed")
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .slice(-4)
    .join("\n\n");
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const previousBlock = previous ? "## Recent Cycle History\n\n" + previous : "## Recent Cycle History\n\n_No prior cycle history yet._";

  return buildPrompt({
    promptKind: "deep-coordinator",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, previousBlock],
    sections: [
    "You are the section coordinator for an ongoing multi-model essay feedback session.",
    buildStructuredKoreanResponseInstruction(),
    "Narrow the next revision down to exactly one section-sized objective.",
    "Do not write the section itself. Planning and scope control only.",
    "Do not search Notion or browse external sources yourself. Use only the provided context and Notion Brief.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Section",
    "## Current Objective",
    "## Rewrite Direction",
    "## Must Keep",
    "## Must Resolve",
    "## Available Evidence",
    "## Exit Criteria",
    "## Next Owner",
    "Next Owner should usually be section_drafter unless more research is clearly required.",
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
    "Keep every field operational and concise. The goal is to help the drafter write the next section revision safely."
    ]
  });
}

function buildSectionDrafterPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  brief: SectionCoordinationBrief,
  latestArtifacts?: RunArtifacts
): BuiltPrompt {
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const briefBlock = buildSectionCoordinationBriefBlock(brief);

  return buildPrompt({
    promptKind: "deep-drafter",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, briefBlock],
    sections: [
    "You are the section drafter for a multi-model essay writing workflow.",
    buildStructuredKoreanResponseInstruction(),
    "Write the actual section text using only the supplied coordination brief and evidence boundaries.",
    "Do not invent new evidence or broaden attribution beyond what the brief safely allows.",
    "Return Markdown with exactly these top-level sections:",
    "## Section Draft",
    "## Change Rationale",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    briefBlock,
    "",
    "Section Draft should be the prose only for the target section, not the whole essay."
    ]
  });
}

function buildDeepReviewerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  allTurns: ReviewTurn[],
  round: number,
  currentParticipantId: string,
  latestArtifacts: RunArtifacts | undefined,
  userInterventions: Array<{ round: number; text: string }>,
  perspective: ReviewerPerspective | undefined,
  brief: SectionCoordinationBrief,
  draftOutput: SectionDraftOutput
): BuiltPrompt {
  const visibleTurns = allTurns.filter((turn) => {
    if (turn.round === round && turn.role === "reviewer" && turn.participantId !== currentParticipantId) {
      return false;
    }
    return true;
  });

  const previous = visibleTurns
    .filter((turn) => turn.role === "reviewer")
    .map((turn) => `## ${turnLabel(turn)} round ${turn.round}\n${turn.response}`)
    .slice(-4)
    .join("\n\n");
  const perspectiveInstruction = getPerspectiveInstruction(perspective);
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const previousBlock = previous ? "## Prior Reviewer Notes\n\n" + previous : "## Prior Reviewer Notes\n\n_No prior reviewer notes yet._";
  const briefBlock = buildSectionCoordinationBriefBlock(brief);
  const draftBlock = buildSectionDraftBlock(draftOutput.sectionDraft, draftOutput.changeRationale);

  return buildPrompt({
    promptKind: "deep-reviewer",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, briefBlock, draftBlock, previousBlock],
    sections: [
    "You are a role-specific reviewer collaborating with other model reviewers.",
    buildStructuredKoreanResponseInstruction(),
    perspectiveInstruction,
    "Review only the current section draft against the coordinator's objective and evidence boundaries.",
    `Cycle: ${round}`,
    "Do not search Notion or browse external sources yourself. Use only the provided context and Notion Brief.",
    "Return Markdown with exactly these top-level sections:",
    "## Judgment",
    "## Reason",
    "## Condition To Close",
    "## Direct Responses To Other Reviewers",
    "Judgment must be exactly one of: ACCEPT, ADVISORY, BLOCK.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    briefBlock,
    "",
    draftBlock,
    "",
    previousBlock,
    "",
    "Prioritize concrete, evidence-based feedback tied to your assigned lens."
    ]
  });
}

function buildDeepCoordinatorDecisionPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  reviewerTurns: ReviewTurn[],
  latestArtifacts: RunArtifacts | undefined,
  brief: SectionCoordinationBrief,
  draftOutput: SectionDraftOutput
): BuiltPrompt {
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const briefBlock = buildSectionCoordinationBriefBlock(brief);
  const draftBlock = buildSectionDraftBlock(draftOutput.sectionDraft, draftOutput.changeRationale);
  const reviewerBlock = buildReviewerDecisionBlock(reviewerTurns, "## Reviewer Feedback For This Cycle");

  return buildPrompt({
    promptKind: "deep-coordinator-decision",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, briefBlock, draftBlock, reviewerBlock],
    sections: [
    "You are the section coordinator deciding whether the drafted section is ready to integrate.",
    buildStructuredKoreanResponseInstruction(),
    "Do not rewrite the section yourself. Evaluate reviewer judgments and decide the next owner.",
    "Return Markdown with exactly these top-level sections:",
    "## Summary",
    "## Improvement Plan",
    "## Next Owner",
    "Next Owner must be exactly one of: section_drafter, context_researcher, finalizer.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    briefBlock,
    "",
    draftBlock,
    "",
    reviewerBlock
    ]
  });
}

function buildDeepFinalizerPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  latestArtifacts: RunArtifacts | undefined,
  brief: SectionCoordinationBrief,
  draftOutput: SectionDraftOutput,
  reviewerTurns: ReviewTurn[],
  decision: CoordinatorDecisionOutput
): BuiltPrompt {
  const sessionSnapshot = buildSessionSnapshotBlock(latestArtifacts);
  const guidanceBlock = buildUserGuidanceBlock(userInterventions);
  const briefBlock = buildSectionCoordinationBriefBlock(brief);
  const draftBlock = buildSectionDraftBlock(draftOutput.sectionDraft, draftOutput.changeRationale);
  const reviewerBlock = buildReviewerDecisionBlock(reviewerTurns);
  const decisionBlock = buildCoordinatorDecisionBlock(decision);

  return buildPrompt({
    promptKind: "deep-finalizer",
    contextProfile: "full",
    contextMarkdown,
    notionBrief,
    historyBlocks: [sessionSnapshot, briefBlock, draftBlock, reviewerBlock, decisionBlock],
    sections: [
    "You are the finalizer for a multi-model essay revision workflow.",
    buildFinalEssayKoreanInstruction(),
    "Integrate the approved section draft into the full essay while preserving evidence boundaries and reviewer decisions.",
    "Do not invent new evidence or claims.",
    "Return Markdown with exactly these top-level sections:",
    "## Final Draft",
    "## Final Checks",
    "Final Checks should be a short bullet list of residual cautions or '- 없음'.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    sessionSnapshot,
    sessionSnapshot ? "" : "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    briefBlock,
    "",
    draftBlock,
    "",
    reviewerBlock,
    "",
    decisionBlock
    ]
  });
}

function getPerspectiveInstruction(perspective?: ReviewerPerspective): string {
  switch (perspective) {
    case "technical":
      return [
        "Your assigned lens is EVIDENCE & FACTUAL SAFETY.",
        "Focus on: whether claims have concrete evidence (numbers, ownership, tools, implementation detail),",
        "whether project-level outcomes are being overstated as personal contribution,",
        "and whether the draft safely distinguishes implementation, operations, and decision-making responsibility.",
        "Do NOT focus on tone or emotional authenticity — another reviewer handles that."
      ].join(" ");
    case "interviewer":
      return [
        "Your assigned lens is COMPANY & ROLE FIT.",
        "Read the draft as a hiring manager would.",
        "Focus on: whether the 'why this company / why this role' argument is convincing or generic,",
        "whether the candidate's experience really connects to the target position,",
        "and what follow-up questions this fit story would trigger in an interview.",
        "Do NOT focus on tone or raw evidence density — other reviewers handle that."
      ].join(" ");
    case "authenticity":
      return [
        "Your assigned lens is VOICE & AUTHENTICITY.",
        "Focus on: whether the draft sounds like a real person or an AI template,",
        "whether emotions and growth narrative feel genuine,",
        "whether any sentence could be copy-pasted into a different company's application unchanged,",
        "and whether the writer's personality comes through.",
        "Do NOT focus on technical accuracy or company-role fit — other reviewers handle those."
      ].join(" ");
    default:
      return "";
  }
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
  const challengeTicketsBlock = buildChallengeTicketBlock(ledger);
  const hasReviewerHistory = turns.some((turn) => turn.role === "reviewer" && turn.status === "completed" && turn.round > 0);

  return buildPrompt({
    promptKind: "realtime-coordinator-open",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, challengeTicketsBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "This turn is facilitation only. Do not write the full essay yet.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Target Section Key",
    "## Current Objective",
    "## Rewrite Direction",
    "## Must Keep",
    "## Must Resolve",
    "## Available Evidence",
    "## Exit Criteria",
    "## Next Owner",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "## Deferred Challenges",
    "## Section Outcome",
    "## Challenge Decisions",
    "Write Current Focus as one line and Target Section as a short label.",
    "Write Target Section Key as a stable slug for the current target section.",
    "Use Current Objective to define the section-level success target.",
    "Use Rewrite Direction to describe how the next section draft should change without writing the whole essay.",
    "Must Keep, Must Resolve, Available Evidence, and Exit Criteria must use bullet items. If empty, write exactly '- 없음'.",
    "Next Owner should usually be section_drafter unless more research is clearly required.",
    "Mini Draft should be only a short seed or outline, not polished final prose. The drafter will write the actual section text next.",
    "Accepted Decisions, Open Challenges, and Deferred Challenges must use bullet items. If empty, write exactly '- 없음'.",
    "Open Challenges are blockers for the current Target Section only.",
    "Deferred Challenges are valid follow-up issues for later sections or final polish.",
    "Write Section Outcome as exactly one of: keep-open, close-section, handoff-next-section, write-final.",
    "Use Challenge Decisions to mark ticket transitions with lines like '- [ticketId] close' or '- [new] add | sectionKey=... | sectionLabel=... | severity=advisory | text=...'.",
    "If Open Challenges are empty but Deferred Challenges remain, hand off Target Section to the next deferred issue instead of reopening the completed section.",
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
    challengeTicketsBlock,
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
  const challengeTicketsBlock = buildChallengeTicketBlock(ledger);
  const userMessageBlock = [
    "## New User Messages",
    ...messages.map((message, index) => `### Message ${index + 1}\n${message}`)
  ].join("\n\n");

  return buildPrompt({
    promptKind: "realtime-coordinator-redirect",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, challengeTicketsBlock, historyBlock, userMessageBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "The user just redirected the discussion. Reply first and reset the direction.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Target Section Key",
    "## Current Objective",
    "## Rewrite Direction",
    "## Must Keep",
    "## Must Resolve",
    "## Available Evidence",
    "## Exit Criteria",
    "## Next Owner",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "## Deferred Challenges",
    "## Section Outcome",
    "## Challenge Decisions",
    "Acknowledge the new user message by reflecting it inside Current Focus and Rewrite Direction.",
    "Write Target Section Key as a stable slug for the current target section.",
    "Must Keep, Must Resolve, Available Evidence, and Exit Criteria must use bullet items. If empty, write exactly '- 없음'.",
    "Next Owner should usually be section_drafter unless more research is clearly required.",
    "Mini Draft should be only a short seed or outline, not polished final prose.",
    "Accepted Decisions, Open Challenges, and Deferred Challenges must use bullet items. If empty, write exactly '- 없음'.",
    "Open Challenges are blockers for the current Target Section only.",
    "Deferred Challenges are valid follow-up issues for later sections or final polish.",
    "Write Section Outcome as exactly one of: keep-open, close-section, handoff-next-section, write-final.",
    "Use Challenge Decisions to mark ticket transitions with lines like '- [ticketId] close' or '- [new] add | sectionKey=... | sectionLabel=... | severity=advisory | text=...'.",
    "If Open Challenges are empty but Deferred Challenges remain, hand off Target Section to the next deferred issue instead of reopening the completed section.",
    "Do not write the full essay yet.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    challengeTicketsBlock,
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
    visibleTurns.filter((turn) => turn.participantId === "coordinator" && turn.round < round),
    { maxTurns: 2, maxCharsPerTurn: 220 }
  );
  const coordinatorReferenceBlock = buildCoordinatorReferenceBlock(visibleTurns, round, ledger);
  const reviewerReferenceBlock = buildReviewerReferencesBlock(visibleTurns, round, currentParticipantId);
  const ledgerBlock = buildDiscussionLedgerBlock(ledger);
  const challengeTicketsBlock = buildChallengeTicketBlock(ledger);
  const perspectiveInstruction = getPerspectiveInstruction(perspective);
  const crossFeedbackInstruction = 'Line 3 starts with "Cross-feedback:" and explicitly respond to exactly one reference using either "Cross-feedback: [refId] agree ..." or "Cross-feedback: [refId] disagree ...".';

  return buildPrompt({
    promptKind: "realtime-reviewer",
    contextProfile: "minimal",
    contextMarkdown,
    notionBrief,
    historyBlocks: [coordinatorReferenceBlock, reviewerReferenceBlock, challengeTicketsBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are a reviewer in a realtime multi-model essay discussion.",
    buildRealtimeKoreanResponseInstruction(),
    perspectiveInstruction,
    `Round: ${round}`,
    "Review the current discussion ledger, especially the Section Draft when available and otherwise the Mini Draft seed.",
    "Keep the blind review rule: do not assume anything about same-round reviewer replies that are not shown below.",
    "Respond in exactly 3 short labeled lines plus one final status line.",
    'Line 1 starts with "Mini Draft:" and identify one phrase or sentence in the current section draft to keep or revise.',
    'Line 2 starts with "Challenge:" and use exactly one verdict in the form "Challenge: [ticketId|new] close because ...", "Challenge: [ticketId|new] keep-open because ...", or "Challenge: [ticketId|new] defer because ...".',
    crossFeedbackInstruction,
    "The final line must be exactly one of these:",
    "Status: APPROVE",
    "Status: REVISE",
    "Status: BLOCK",
    "Use APPROVE if the current direction is section-ready.",
    "Use REVISE if improvement is recommended but it should not block closing the current Target Section.",
    "Use BLOCK only if the current Target Section should not close yet.",
    "Do not use headings or bullet lists.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    challengeTicketsBlock,
    "",
    coordinatorReferenceBlock,
    "",
    reviewerReferenceBlock,
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
    "You are the finalizer closing a realtime multi-model essay review session.",
    buildFinalEssayKoreanInstruction(),
    "The current section is ready, no blocking reviewer feedback remains, and there are no Deferred Challenges left.",
    "Write the final polished essay draft now.",
    "Use the Section Draft when available as the local seed, preserve the Accepted Decisions, and keep the final essay aligned with the resolved focus.",
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
  const challengeTicketsBlock = buildChallengeTicketBlock(ledger);

  return buildPrompt({
    promptKind: "realtime-coordinator-challenge",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, challengeTicketsBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "All reviewers agreed too quickly. This often means groupthink.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Target Section Key",
    "## Current Objective",
    "## Rewrite Direction",
    "## Must Keep",
    "## Must Resolve",
    "## Available Evidence",
    "## Exit Criteria",
    "## Next Owner",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "## Deferred Challenges",
    "## Section Outcome",
    "## Challenge Decisions",
    "Use this turn to challenge one assumption the reviewers accepted too quickly and add at least one concrete Open Challenge.",
    "Write Target Section Key as a stable slug for the current target section.",
    "Must Keep, Must Resolve, Available Evidence, and Exit Criteria must use bullet items. If empty, write exactly '- 없음'.",
    "Next Owner should usually be section_drafter unless more research is clearly required.",
    "Mini Draft should be only a short seed or outline, not polished final prose.",
    "Deferred Challenges should capture later follow-up issues instead of blocking the current section.",
    "Write Section Outcome as exactly one of: keep-open, close-section, handoff-next-section, write-final.",
    "Use Challenge Decisions to mark ticket transitions with lines like '- [ticketId] close' or '- [new] add | sectionKey=... | sectionLabel=... | severity=advisory | text=...'.",
    "If the current section is already closed, redirect the next Target Section to one Deferred Challenge instead of reopening the same section.",
    "Do not write the full essay.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    challengeTicketsBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildWeakConsensusPolishPrompt(
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
  const challengeTicketsBlock = buildChallengeTicketBlock(ledger);

  return buildPrompt({
    promptKind: "realtime-coordinator-polish",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [previousRoundBlock, challengeTicketsBlock, historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
    "You are the coordinator for a realtime multi-model essay review discussion.",
    buildRealtimeKoreanResponseInstruction(),
    `Round: ${round}`,
    "The current section is technically ready, but most reviewers still recommend advisory revisions.",
    "Use one polish round to absorb advisory feedback without opening a new section yet.",
    "Return Markdown with exactly these top-level sections:",
    "## Current Focus",
    "## Target Section",
    "## Target Section Key",
    "## Current Objective",
    "## Rewrite Direction",
    "## Must Keep",
    "## Must Resolve",
    "## Available Evidence",
    "## Exit Criteria",
    "## Next Owner",
    "## Mini Draft",
    "## Accepted Decisions",
    "## Open Challenges",
    "## Deferred Challenges",
    "## Section Outcome",
    "## Challenge Decisions",
    "Write Target Section Key as a stable slug for the current target section.",
    "Must Keep, Must Resolve, Available Evidence, and Exit Criteria must use bullet items. If empty, write exactly '- 없음'.",
    "Next Owner should usually be section_drafter unless more research is clearly required.",
    "Mini Draft should be only a short seed or outline, not polished final prose.",
    "Write Section Outcome as exactly one of: keep-open, close-section, handoff-next-section, write-final.",
    "Do not invent new blocker scope unless the reviewer feedback clearly justifies it.",
    "Use Challenge Decisions to close, keep-open, defer, promote, or add tickets as needed.",
    "",
    contextMarkdown,
    "",
    notionBrief ? "## Notion Brief\n\n" + notionBrief : "",
    notionBrief ? "" : "",
    ledgerBlock,
    "",
    challengeTicketsBlock,
    "",
    previousRoundBlock,
    "",
    guidanceBlock,
    guidanceBlock ? "" : "",
    historyBlock
    ]
  });
}

function buildNotionPrePassPrompt(
  contextMarkdown: string,
  notionRequest: NotionRequestDescriptor | undefined
): BuiltPrompt {
  const requestHeading = notionRequest?.kind === "auto" ? "## Auto Context Request" : "## User Notion Request";
  return buildPrompt({
    promptKind: "notion-prepass",
    contextProfile: "minimal",
    contextMarkdown,
    sections: [
    "You are the context researcher for a multi-model essay feedback discussion.",
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
    requestHeading,
    notionRequest?.text ?? ""
    ]
  });
}

function buildRealtimeSectionDrafterPrompt(
  contextMarkdown: string,
  notionBrief: string,
  userInterventions: Array<{ round: number; text: string }>,
  turns: ReviewTurn[],
  round: number,
  ledger: DiscussionLedger
): BuiltPrompt {
  const guidanceBlock = buildUserGuidanceBlock(userInterventions, "round");
  const historyBlock = buildRealtimeDiscussionHistory(turns, { maxTurns: 3, maxCharsPerTurn: 260 });
  const ledgerBlock = buildDiscussionLedgerBlock(ledger);

  return buildPrompt({
    promptKind: "realtime-drafter",
    contextProfile: "compact",
    contextMarkdown,
    notionBrief,
    historyBlocks: [historyBlock],
    discussionLedgerBlock: ledgerBlock,
    sections: [
      "You are the section drafter in a realtime multi-model essay workflow.",
      buildStructuredKoreanResponseInstruction(),
      `Round: ${round}`,
      "Use the coordinator's ledger to write the actual section prose for the current target section.",
      "Do not invent new evidence or claims outside the provided context, Notion Brief, and ledger.",
      "Return Markdown with exactly these top-level sections:",
      "## Section Draft",
      "## Change Rationale",
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
    ...(ledger.targetSectionKey ? [`- Target Section Key: ${ledger.targetSectionKey}`] : []),
    ...(ledger.nextOwner ? [`- Next Owner: ${ledger.nextOwner}`] : []),
    "",
    "### Current Focus",
    ledger.currentFocus,
    "",
    ...(ledger.currentObjective ? ["### Current Objective", ledger.currentObjective, ""] : []),
    ...(ledger.rewriteDirection ? ["### Rewrite Direction", ledger.rewriteDirection, ""] : []),
    "### Mini Draft",
    ledger.miniDraft,
    "",
    ...(ledger.sectionDraft ? ["### Section Draft", ledger.sectionDraft, ""] : []),
    ...(ledger.changeRationale ? ["### Change Rationale", ledger.changeRationale, ""] : []),
    ...(ledger.mustKeep ? ["### Must Keep", ...formatDiscussionLedgerItems(ledger.mustKeep), ""] : []),
    ...(ledger.mustResolve ? ["### Must Resolve", ...formatDiscussionLedgerItems(ledger.mustResolve), ""] : []),
    ...(ledger.availableEvidence ? ["### Available Evidence", ...formatDiscussionLedgerItems(ledger.availableEvidence), ""] : []),
    ...(ledger.exitCriteria ? ["### Exit Criteria", ...formatDiscussionLedgerItems(ledger.exitCriteria), ""] : []),
    "### Accepted Decisions",
    ...formatDiscussionLedgerItems(ledger.acceptedDecisions),
    "",
    "### Open Challenges",
    ...formatDiscussionLedgerItems(ledger.openChallenges),
    "",
    "### Deferred Challenges",
    ...formatDiscussionLedgerItems(ledger.deferredChallenges)
  ].join("\n");
}

function buildChallengeTicketBlock(ledger?: DiscussionLedger): string {
  const tickets = ledger?.tickets ?? [];
  if (tickets.length === 0) {
    return "## Challenge Tickets\n\n_No challenge tickets yet._";
  }

  return [
    "## Challenge Tickets",
    ...tickets.map((ticket) =>
      `- [${ticket.id}] ${ticket.status} | ${ticket.severity} | sectionKey=${ticket.sectionKey} | sectionLabel=${ticket.sectionLabel} | text=${ticket.text}`
    )
  ].join("\n");
}

function buildDiscussionLedgerArtifact(ledger: DiscussionLedger): string {
  const tickets = getLedgerTickets(ledger);
  return [
    "# Discussion Ledger",
    "",
    `- Updated At Round: ${ledger.updatedAtRound}`,
    `- Target Section: ${ledger.targetSection}`,
    ...(ledger.targetSectionKey ? [`- Target Section Key: ${ledger.targetSectionKey}`] : []),
    ...(ledger.sectionOutcome ? [`- Section Outcome: ${ledger.sectionOutcome}`] : []),
    ...(ledger.nextOwner ? [`- Next Owner: ${ledger.nextOwner}`] : []),
    "",
    "## Current Focus",
    ledger.currentFocus,
    "",
    ...(ledger.currentObjective ? ["## Current Objective", ledger.currentObjective, ""] : []),
    ...(ledger.rewriteDirection ? ["## Rewrite Direction", ledger.rewriteDirection, ""] : []),
    "## Mini Draft",
    ledger.miniDraft,
    "",
    ...(ledger.sectionDraft ? ["## Section Draft", ledger.sectionDraft, ""] : []),
    ...(ledger.changeRationale ? ["## Change Rationale", ledger.changeRationale, ""] : []),
    ...(ledger.mustKeep ? ["## Must Keep", ...formatDiscussionLedgerItems(ledger.mustKeep), ""] : []),
    ...(ledger.mustResolve ? ["## Must Resolve", ...formatDiscussionLedgerItems(ledger.mustResolve), ""] : []),
    ...(ledger.availableEvidence ? ["## Available Evidence", ...formatDiscussionLedgerItems(ledger.availableEvidence), ""] : []),
    ...(ledger.exitCriteria ? ["## Exit Criteria", ...formatDiscussionLedgerItems(ledger.exitCriteria), ""] : []),
    "## Accepted Decisions",
    ...formatDiscussionLedgerItems(ledger.acceptedDecisions),
    "",
    "## Open Challenges",
    ...formatDiscussionLedgerItems(ledger.openChallenges),
    "",
    "## Deferred Challenges",
    ...formatDiscussionLedgerItems(ledger.deferredChallenges),
    ...(tickets.length > 0
      ? [
          "",
          "## Challenge Tickets",
          ...tickets.map((ticket) =>
            `- [${ticket.id}] ${ticket.severity} | ${ticket.status} | ${ticket.sectionKey} | ${ticket.text}`
          )
        ]
      : [])
  ].join("\n");
}

function formatDiscussionLedgerItems(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- 없음"];
}

function extractDiscussionLedger(output: string, round: number): DiscussionLedger | undefined {
  const currentFocus = normalizeLedgerSingleLine(extractMarkdownSection(output, "Current Focus"));
  const targetSection = normalizeLedgerSingleLine(extractMarkdownSection(output, "Target Section"));
  const rewriteDirection = normalizeLedgerParagraph(extractMarkdownSection(output, "Rewrite Direction"));
  const currentObjective = normalizeLedgerParagraph(extractMarkdownSection(output, "Current Objective"));
  const miniDraft = normalizeLedgerParagraph(extractMarkdownSection(output, "Mini Draft")) || rewriteDirection;
  if (!currentFocus || !targetSection || !miniDraft) {
    return undefined;
  }

  const targetSectionKey =
    normalizeLedgerSingleLine(extractMarkdownSection(output, "Target Section Key")) || normalizeSectionKey(targetSection);
  const openChallenges = parseDiscussionLedgerItems(extractMarkdownSection(output, "Open Challenges"));
  const deferredChallenges = parseDiscussionLedgerItems(extractMarkdownSection(output, "Deferred Challenges"));
  const sectionOutcome = extractSectionOutcome(output);
  const baseTickets = seedTicketsFromLegacyLedger({
    targetSection,
    targetSectionKey,
    openChallenges,
    deferredChallenges,
    updatedAtRound: round
  });
  const challengeDecisions = extractChallengeDecisions(output);
  const tickets = challengeDecisions.length > 0
    ? applyCoordinatorChallengeDecisions({
        baseTickets,
        decisions: challengeDecisions,
        targetSection,
        targetSectionKey,
        round
      })
    : baseTickets;
  const derivedViews = challengeDecisions.length > 0
    ? deriveLedgerViewsFromTickets(tickets, targetSectionKey)
    : undefined;
  return {
    currentFocus,
    miniDraft,
    rewriteDirection: rewriteDirection || undefined,
    currentObjective: currentObjective || undefined,
    mustKeep: parseDiscussionLedgerItems(extractMarkdownSection(output, "Must Keep")),
    mustResolve: parseDiscussionLedgerItems(extractMarkdownSection(output, "Must Resolve")),
    availableEvidence: parseDiscussionLedgerItems(extractMarkdownSection(output, "Available Evidence")),
    exitCriteria: parseDiscussionLedgerItems(extractMarkdownSection(output, "Exit Criteria")),
    nextOwner: normalizeLedgerSingleLine(extractMarkdownSection(output, "Next Owner"))
      ? normalizeEssayRoleId(extractMarkdownSection(output, "Next Owner"), "section_drafter")
      : undefined,
    sectionDraft: normalizeLedgerParagraph(extractMarkdownSection(output, "Section Draft")) || undefined,
    changeRationale: normalizeLedgerParagraph(extractMarkdownSection(output, "Change Rationale")) || undefined,
    acceptedDecisions: parseDiscussionLedgerItems(extractMarkdownSection(output, "Accepted Decisions")),
    openChallenges: derivedViews?.openChallenges ?? openChallenges,
    deferredChallenges: derivedViews?.deferredChallenges ?? deferredChallenges,
    targetSection,
    targetSectionKey,
    tickets,
    sectionOutcome,
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

function normalizeSectionKey(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "section";
}

function seedTicketsFromLegacyLedger(input: {
  targetSection: string;
  targetSectionKey: string;
  openChallenges: string[];
  deferredChallenges: string[];
  updatedAtRound: number;
}): ChallengeTicket[] {
  const tickets: ChallengeTicket[] = [];
  const seenKeys = new Set<string>();
  const addTicket = (
    text: string,
    status: ChallengeStatus,
    severity: ChallengeSeverity,
    sectionKey: string,
    sectionLabel: string,
    source: ChallengeSource,
    handoffPriority: number
  ) => {
    const ticketId = buildChallengeTicketId(sectionKey, text);
    if (!text || seenKeys.has(ticketId)) {
      return;
    }
    seenKeys.add(ticketId);
    tickets.push({
      id: ticketId,
      text,
      sectionKey,
      sectionLabel,
      severity,
      status,
      source,
      introducedAtRound: input.updatedAtRound,
      lastUpdatedAtRound: input.updatedAtRound,
      handoffPriority
    });
  };

  input.openChallenges.forEach((challenge, index) => {
    addTicket(
      challenge,
      "open",
      "blocking",
      input.targetSectionKey,
      input.targetSection,
      "system",
      100 - index
    );
  });

  input.deferredChallenges.forEach((challenge, index) => {
    const deferredSectionKey = normalizeSectionKey(challenge);
    addTicket(
      challenge,
      "deferred",
      "advisory",
      deferredSectionKey,
      challenge,
      "system",
      50 - index
    );
  });

  return tickets;
}

function buildChallengeTicketId(sectionKey: string, text: string): string {
  const normalizedSection = normalizeSectionKey(sectionKey).slice(0, 24);
  const normalizedText = normalizeSectionKey(text).slice(0, 24);
  return `ticket-${normalizedSection || "section"}-${normalizedText || "challenge"}`;
}

function extractSectionOutcome(output: string): SectionOutcome | undefined {
  const raw = normalizeLedgerSingleLine(extractMarkdownSection(output, "Section Outcome"));
  if (raw === "keep-open" || raw === "close-section" || raw === "handoff-next-section" || raw === "write-final") {
    return raw;
  }
  return undefined;
}

function extractChallengeDecisions(output: string): Array<ParsedChallengeDecision | ParsedChallengeAddDecision> {
  const section = extractMarkdownSection(output, "Challenge Decisions");
  if (!section) {
    return [];
  }

  const decisions: Array<ParsedChallengeDecision | ParsedChallengeAddDecision> = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, "").trim();
    if (!line) {
      continue;
    }

    const actionMatch = line.match(/^\[(.+?)\]\s+(close|keep-open|defer|promote)\s*$/i);
    if (actionMatch) {
      decisions.push({
        ticketId: actionMatch[1],
        action: actionMatch[2].toLowerCase() as ParsedChallengeDecision["action"]
      });
      continue;
    }

    const addMatch = line.match(/^\[(new)\]\s+add\s*\|\s*(.+)$/i);
    if (!addMatch) {
      continue;
    }

    const fields = addMatch[2]
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, part) => {
        const [key, ...rest] = part.split("=");
        if (!key || rest.length === 0) {
          return acc;
        }
        acc[key.trim()] = rest.join("=").trim();
        return acc;
      }, {});
    const severity = fields.severity === "blocking" || fields.severity === "advisory"
      ? fields.severity
      : undefined;
    decisions.push({
      ticketId: "new",
      action: "add",
      sectionKey: fields.sectionKey,
      sectionLabel: fields.sectionLabel,
      severity,
      text: fields.text
    });
  }

  return decisions;
}

function applyCoordinatorChallengeDecisions(input: {
  baseTickets: ChallengeTicket[];
  decisions: Array<ParsedChallengeDecision | ParsedChallengeAddDecision>;
  targetSection: string;
  targetSectionKey: string;
  round: number;
}): ChallengeTicket[] {
  const tickets = new Map(input.baseTickets.map((ticket) => [ticket.id, { ...ticket }]));
  for (const decision of input.decisions) {
    if (decision.action === "add") {
      if (!decision.text) {
        continue;
      }
      const sectionKey = decision.sectionKey ? normalizeSectionKey(decision.sectionKey) : input.targetSectionKey;
      const sectionLabel = decision.sectionLabel?.trim() || input.targetSection;
      const id = buildChallengeTicketId(sectionKey, decision.text);
      tickets.set(id, {
        id,
        text: decision.text,
        sectionKey,
        sectionLabel,
        severity: decision.severity ?? "advisory",
        status: sectionKey === input.targetSectionKey ? "open" : "deferred",
        source: "coordinator",
        introducedAtRound: input.round,
        lastUpdatedAtRound: input.round,
        handoffPriority: 100
      });
      continue;
    }

    const ticket = tickets.get(decision.ticketId);
    if (!ticket) {
      continue;
    }

    if (decision.action === "close") {
      ticket.status = "closed";
    } else if (decision.action === "defer") {
      ticket.status = "deferred";
    } else {
      ticket.status = "open";
      ticket.sectionKey = input.targetSectionKey;
      ticket.sectionLabel = input.targetSection;
    }
    ticket.lastUpdatedAtRound = input.round;
    tickets.set(ticket.id, ticket);
  }

  return [...tickets.values()];
}

function deriveLedgerViewsFromTickets(
  tickets: ChallengeTicket[],
  targetSectionKey: string
): { openChallenges: string[]; deferredChallenges: string[] } {
  const openChallenges = tickets
    .filter((ticket) => ticket.status === "open" && ticket.sectionKey === targetSectionKey)
    .map((ticket) => ticket.text);
  const deferredChallenges = tickets
    .filter((ticket) => ticket.status === "deferred" || (ticket.status === "open" && ticket.sectionKey !== targetSectionKey))
    .map((ticket) => ticket.text);
  return {
    openChallenges: dedupeStrings(openChallenges),
    deferredChallenges: dedupeStrings(deferredChallenges)
  };
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    deduped.push(item);
  }
  return deduped;
}

function getLedgerTargetSectionKey(ledger?: DiscussionLedger): string {
  return ledger?.targetSectionKey || (ledger ? normalizeSectionKey(ledger.targetSection) : "section");
}

function getLedgerTickets(ledger?: DiscussionLedger): ChallengeTicket[] {
  if (!ledger) {
    return [];
  }
  if (ledger.tickets && ledger.tickets.length > 0) {
    return ledger.tickets;
  }
  return seedTicketsFromLegacyLedger({
    targetSection: ledger.targetSection,
    targetSectionKey: getLedgerTargetSectionKey(ledger),
    openChallenges: ledger.openChallenges,
    deferredChallenges: ledger.deferredChallenges,
    updatedAtRound: ledger.updatedAtRound
  });
}

function pickNextTargetSectionCluster(ledger?: DiscussionLedger): ChallengeTicketCluster | undefined {
  if (!ledger) {
    return undefined;
  }

  const currentSectionKey = getLedgerTargetSectionKey(ledger);
  const tickets = getLedgerTickets(ledger).filter(
    (ticket) => ticket.status !== "closed" && ticket.sectionKey !== currentSectionKey
  );
  if (tickets.length === 0) {
    return undefined;
  }

  const clusters = new Map<string, ChallengeTicketCluster>();
  for (const ticket of tickets) {
    const existing = clusters.get(ticket.sectionKey);
    if (existing) {
      existing.tickets.push(ticket);
      if (ticket.lastUpdatedAtRound >= existing.tickets[0].lastUpdatedAtRound) {
        existing.sectionLabel = ticket.sectionLabel;
      }
      continue;
    }
    clusters.set(ticket.sectionKey, {
      sectionKey: ticket.sectionKey,
      sectionLabel: ticket.sectionLabel,
      tickets: [ticket]
    });
  }

  return [...clusters.values()].sort((left, right) => {
    const leftHasBlocking = left.tickets.some((ticket) => ticket.severity === "blocking") ? 1 : 0;
    const rightHasBlocking = right.tickets.some((ticket) => ticket.severity === "blocking") ? 1 : 0;
    if (leftHasBlocking !== rightHasBlocking) {
      return rightHasBlocking - leftHasBlocking;
    }

    const leftPriority = Math.max(...left.tickets.map((ticket) => ticket.handoffPriority));
    const rightPriority = Math.max(...right.tickets.map((ticket) => ticket.handoffPriority));
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    const leftRound = Math.min(...left.tickets.map((ticket) => ticket.introducedAtRound));
    const rightRound = Math.min(...right.tickets.map((ticket) => ticket.introducedAtRound));
    if (leftRound !== rightRound) {
      return leftRound - rightRound;
    }

    return right.tickets.length - left.tickets.length;
  })[0];
}

function validateSectionOutcome(
  requestedOutcome: SectionOutcome | undefined,
  options: { currentSectionReady: boolean; wholeDocumentReady: boolean; hasNextCluster: boolean }
): SectionOutcome {
  if (options.wholeDocumentReady) {
    return "write-final";
  }
  if (options.currentSectionReady && options.hasNextCluster) {
    return "handoff-next-section";
  }
  if (options.currentSectionReady) {
    return requestedOutcome === "keep-open" ? "keep-open" : "close-section";
  }
  return "keep-open";
}

function transitionDiscussionLedgerToNextCluster(
  ledger: DiscussionLedger,
  cluster: ChallengeTicketCluster,
  round: number
): DiscussionLedger {
  const tickets = getLedgerTickets(ledger).map((ticket) => {
    if (ticket.sectionKey !== cluster.sectionKey || ticket.status === "closed") {
      return ticket;
    }
    return {
      ...ticket,
      status: "open" as const,
      lastUpdatedAtRound: round
    };
  });
  const derivedViews = deriveLedgerViewsFromTickets(tickets, cluster.sectionKey);
  return {
    ...ledger,
    currentFocus: `${cluster.sectionLabel} 섹션으로 handoff해 남은 쟁점을 정리합니다.`,
    currentObjective: `${cluster.sectionLabel} 섹션의 남은 쟁점을 해결합니다.`,
    targetSection: cluster.sectionLabel,
    targetSectionKey: cluster.sectionKey,
    rewriteDirection: `${cluster.sectionLabel} 섹션의 핵심 논점을 다시 정렬합니다.`,
    miniDraft: `${cluster.sectionLabel} 미니 초안을 다음 라운드에서 새로 정리합니다.`,
    sectionDraft: undefined,
    changeRationale: undefined,
    mustKeep: [],
    mustResolve: cluster.tickets.map((ticket) => ticket.text),
    availableEvidence: [],
    exitCriteria: [],
    nextOwner: "section_drafter",
    openChallenges: derivedViews.openChallenges,
    deferredChallenges: derivedViews.deferredChallenges,
    tickets,
    sectionOutcome: "handoff-next-section",
    updatedAtRound: round
  };
}

function shouldRunWeakConsensusPolish(
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>,
  currentSectionKey: string,
  polishRoundsUsed: Set<string>
): boolean {
  if (polishRoundsUsed.has(currentSectionKey) || activeReviewers.length === 0) {
    return false;
  }

  let reviseCount = 0;
  for (const reviewer of activeReviewers) {
    if (statuses.get(reviewer.participantId) === "REVISE") {
      reviseCount += 1;
    }
  }

  return reviseCount > Math.floor(activeReviewers.length / 2);
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
    `### Current Revised Draft\n${artifacts.revisedDraft}`,
    artifacts.finalChecks ? `### Current Final Checks\n${artifacts.finalChecks}` : ""
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

function resolveNotionRequestDescriptor(
  explicitRequest?: string,
  continuationNote?: string,
  pageIds?: string[]
): NotionRequestDescriptor | undefined {
  const normalizedExplicit = normalizeNotionRequest(explicitRequest);
  if (normalizedExplicit) {
    return { text: normalizedExplicit, kind: "explicit" };
  }

  const implicitRequest = normalizeNotionRequest(deriveImplicitNotionRequest(continuationNote));
  if (implicitRequest) {
    return { text: implicitRequest, kind: "implicit" };
  }

  const autoRequest = buildAutoNotionRequest(pageIds);
  if (autoRequest) {
    return { text: autoRequest, kind: "auto" };
  }

  return undefined;
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
      const objection = extractRealtimeReviewerObjection(turn.response);
      return `- ${turnLabel(turn)}: ${truncateContinuationText(objection, 180)} (Status: ${status})`;
    })
  ].join("\n");
}

function buildCoordinatorReferenceBlock(
  turns: ReviewTurn[],
  round: number,
  currentLedger?: DiscussionLedger
): string {
  const previousCoordinatorTurn = [...turns]
    .reverse()
    .find((turn) => turn.status === "completed" && turn.participantId === "coordinator" && turn.round > 0 && turn.round < round);
  const previousLedger = previousCoordinatorTurn
    ? extractDiscussionLedger(previousCoordinatorTurn.response, previousCoordinatorTurn.round)
    : undefined;
  const referenceLedger = previousLedger ?? currentLedger;
  if (!referenceLedger) {
    return "## Coordinator Reference\n\n_No coordinator reference yet._";
  }

  const coordinatorReference: RealtimeReferencePacket = {
    refId: `coord-r${referenceLedger.updatedAtRound}`,
    sourceLabel: `Coordinator round ${referenceLedger.updatedAtRound}`,
    summary: buildCoordinatorReferenceSummary(referenceLedger)
  };
  return buildRealtimeReferenceBlock("## Coordinator Reference", [coordinatorReference], "_No coordinator reference yet._");
}

function buildCoordinatorReferenceSummary(ledger: DiscussionLedger): string {
  const summaryParts = [
    `Target Section: ${ledger.targetSection}`,
    `Current Focus: ${ledger.currentFocus}`
  ];
  if (ledger.openChallenges.length > 0) {
    summaryParts.push(`Open Challenges: ${ledger.openChallenges.join("; ")}`);
  }
  if (ledger.deferredChallenges.length > 0) {
    summaryParts.push(`Deferred Challenges: ${ledger.deferredChallenges.join("; ")}`);
  }
  return summaryParts.join(" | ");
}

function buildReviewerReferencesBlock(
  turns: ReviewTurn[],
  round: number,
  currentParticipantId: string
): string {
  const previousRoundTurns = turns.filter(
    (turn) =>
      turn.status === "completed" &&
      turn.role === "reviewer" &&
      turn.round === round - 1 &&
      turn.participantId !== currentParticipantId
  );
  const references = previousRoundTurns.map((turn) => ({
    refId: `rev-r${turn.round}-${turn.participantId ?? "reviewer"}`,
    sourceLabel: `${turnLabel(turn)} round ${turn.round}`,
    summary: extractRealtimeReviewerObjection(turn.response)
  }));
  return buildRealtimeReferenceBlock(
    "## Reviewer References",
    references,
    "_No previous-round reviewer references available._"
  );
}

function buildRealtimeReferenceBlock(heading: string, references: RealtimeReferencePacket[], emptyState: string): string {
  if (references.length === 0) {
    return `${heading}\n\n${emptyState}`;
  }

  return [
    heading,
    ...references.map((reference) => `- [${reference.refId}] ${reference.sourceLabel}: ${truncateContinuationText(reference.summary, 180)}`)
  ].join("\n");
}

function extractRealtimeReviewerObjection(response: string): string {
  const normalizedChallenge = extractNormalizedReviewerChallenge(response);
  if (normalizedChallenge) {
    return `[${normalizedChallenge.ticketId}] ${normalizedChallenge.action} because ${normalizedChallenge.reason}`;
  }

  const challenge = extractRealtimeLabeledLine(response, "Challenge");
  if (challenge) {
    return challenge;
  }

  const crossFeedback = extractRealtimeLabeledLine(response, "Cross-feedback");
  if (crossFeedback) {
    return crossFeedback;
  }

  return extractReviewerObjection(response);
}

function extractRealtimeLabeledLine(response: string, label: string): string {
  const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*:\\s*(.+)$`, "gim");
  const matches = [...response.matchAll(pattern)];
  if (matches.length === 0) {
    return "";
  }

  return matches[matches.length - 1][1].trim();
}

function extractNormalizedReviewerChallenge(response: string): ParsedReviewerChallengeVerdict | undefined {
  const challenge = extractRealtimeLabeledLine(response, "Challenge");
  if (!challenge) {
    return undefined;
  }

  const match = challenge.match(/^\[(.+?)\]\s+(close|keep-open|defer)\s+because\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  return {
    ticketId: match[1].trim(),
    action: match[2].toLowerCase() as ParsedReviewerChallengeVerdict["action"],
    reason: match[3].replace(/\s+/g, " ").trim()
  };
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
      .find((item) => item.length > 0 && !/^(status|mini draft|challenge|cross-feedback):/i.test(item));
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

function hasAllApprovingRealtimeReviewers(
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>
): boolean {
  return activeReviewers.length > 0 && activeReviewers.every((reviewer) => statuses.get(reviewer.participantId) === "APPROVE");
}

function hasBlockingRealtimeReviewer(
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>
): boolean {
  return activeReviewers.some((reviewer) => statuses.get(reviewer.participantId) === "BLOCK");
}

function isCurrentSectionReady(
  ledger: DiscussionLedger | undefined,
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>
): boolean {
  if (!ledger) {
    return false;
  }

  const targetSectionKey = getLedgerTargetSectionKey(ledger);
  const hasOpenBlockingTickets = getLedgerTickets(ledger).some(
    (ticket) => ticket.status === "open" && ticket.sectionKey === targetSectionKey && ticket.severity === "blocking"
  );
  return !hasOpenBlockingTickets && !hasBlockingRealtimeReviewer(activeReviewers, statuses);
}

function isWholeDocumentReady(
  ledger: DiscussionLedger | undefined,
  activeReviewers: ReviewParticipant[],
  statuses: Map<string, RealtimeReviewerStatus>
): boolean {
  return isCurrentSectionReady(ledger, activeReviewers, statuses) && !pickNextTargetSectionCluster(ledger);
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

function buildResearchParticipant(assignment: RoleAssignment): ReviewParticipant {
  return {
    participantId: "context-researcher",
    participantLabel: `${providerLabel(assignment.providerId)} context researcher`,
    providerId: assignment.providerId,
    role: "researcher",
    assignment,
    roleId: "context_researcher"
  };
}

function buildCoordinatorParticipant(assignment: RoleAssignment): ReviewParticipant {
  return {
    participantId: "coordinator",
    participantLabel: `${providerLabel(assignment.providerId)} section coordinator`,
    providerId: assignment.providerId,
    role: "coordinator",
    assignment,
    roleId: "section_coordinator"
  };
}

function buildDrafterParticipant(assignment: RoleAssignment): ReviewParticipant {
  return {
    participantId: "section-drafter",
    participantLabel: `${providerLabel(assignment.providerId)} section drafter`,
    providerId: assignment.providerId,
    role: "drafter",
    assignment,
    roleId: "section_drafter"
  };
}

function buildFinalizerParticipant(assignment: RoleAssignment): ReviewParticipant {
  return {
    participantId: "finalizer",
    participantLabel: `${providerLabel(assignment.providerId)} finalizer`,
    providerId: assignment.providerId,
    role: "finalizer",
    assignment,
    roleId: "finalizer"
  };
}

function buildReviewerParticipants(
  roles: Record<"fit_reviewer" | "evidence_reviewer" | "voice_reviewer", RoleAssignment>
): ReviewParticipant[] {
  return [
    {
      participantId: "reviewer-1",
      participantLabel: `${providerLabel(roles.evidence_reviewer.providerId)} evidence reviewer`,
      providerId: roles.evidence_reviewer.providerId,
      role: "reviewer",
      assignment: roles.evidence_reviewer,
      roleId: "evidence_reviewer",
      perspective: "technical"
    },
    {
      participantId: "reviewer-2",
      participantLabel: `${providerLabel(roles.fit_reviewer.providerId)} fit reviewer`,
      providerId: roles.fit_reviewer.providerId,
      role: "reviewer",
      assignment: roles.fit_reviewer,
      roleId: "fit_reviewer",
      perspective: "interviewer"
    },
    {
      participantId: "reviewer-3",
      participantLabel: `${providerLabel(roles.voice_reviewer.providerId)} voice reviewer`,
      providerId: roles.voice_reviewer.providerId,
      role: "reviewer",
      assignment: roles.voice_reviewer,
      roleId: "voice_reviewer",
      perspective: "authenticity"
    }
  ];
}

function truncateContinuationText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}
