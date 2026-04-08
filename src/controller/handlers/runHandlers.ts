import * as vscode from "vscode";
import { deriveLegacyParticipantsFromRoles, resolveRoleAssignments } from "../../core/roleAssignments";
import { ContinuationPreset, WebviewToExtensionMessage } from "../../core/webviewProtocol";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";

export function createRunHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "runReview"
  | "submitRoundIntervention"
  | "openArtifact"
  | "loadRunContinuation"
  | "continueRunDiscussion"
> {
  return {
    runReview: async (message) => {
      await startRun(ctx, message);
    },
    submitRoundIntervention: async (message) => {
      const outcome = ctx.runSessions.submitIntervention(message.message?.trim() || "");
      ctx.stateStore.setRunState(ctx.runSessions.snapshot());
      await ctx.pushState();
      await ctx.sidebar.postBanner(
        outcome === "queued"
          ? "메시지를 대기열에 넣었습니다. 현재 작성 중인 모델이 끝나면 대화 방향이 바뀝니다."
          : "세션을 계속 진행합니다..."
      );
    },
    openArtifact: async (message) => {
      await openArtifact(ctx, message.projectSlug, message.runId, message.fileName);
    },
    loadRunContinuation: async (message) => {
      await ctx.runBusy("이전 실행을 불러오는 중...", async () => {
        await loadRunContinuation(ctx, message.projectSlug, message.runId);
      });
    },
    continueRunDiscussion: async (message) => {
      await startContinuationRun(ctx, message.projectSlug, message.runId, message.message);
    }
  };
}

export async function startRun(
  ctx: ControllerContext,
  message: Extract<WebviewToExtensionMessage, { type: "runReview" }>
): Promise<void> {
  ctx.runSessions.start(message.projectSlug, message.reviewMode);
  ctx.stateStore.setRunState(ctx.runSessions.snapshot());
  await ctx.pushState();

  try {
    const resolvedRoles = resolveRoleAssignments(
      message.roleAssignments,
      message.coordinatorProvider,
      message.reviewerProviders
    );
    const legacyParticipants = deriveLegacyParticipantsFromRoles(
      resolvedRoles.all,
      message.coordinatorProvider,
      message.reviewerProviders
    );
    await ctx.orchestrator().run(
      {
        projectSlug: message.projectSlug,
        projectQuestionIndex: message.projectQuestionIndex,
        question: message.question,
        draft: message.draft,
        reviewMode: message.reviewMode,
        notionRequest: message.notionRequest,
        continuationFromRunId: message.continuationFromRunId,
        continuationNote: message.continuationNote,
        roleAssignments: resolvedRoles.all,
        coordinatorProvider: legacyParticipants.coordinatorProvider,
        reviewerProviders: legacyParticipants.reviewerProviders,
        rounds: message.rounds,
        selectedDocumentIds: message.selectedDocumentIds,
        charLimit: message.charLimit
      },
      async (event) => {
        await ctx.sidebar.postRunEvent(event);
      },
      async (request) => {
        const pending = ctx.runSessions.waitForIntervention(request);
        ctx.stateStore.setRunState(ctx.runSessions.snapshot());
        await ctx.pushState();
        return pending;
      },
      () => ctx.runSessions.drainQueuedMessages()
    );
    await ctx.sidebar.postBanner("세션이 완료되었습니다.");
  } finally {
    ctx.runSessions.finish();
    ctx.stateStore.setRunState(ctx.runSessions.snapshot());
    await ctx.stateStore.refreshProjects(message.projectSlug);
    await ctx.stateStore.refreshPreferences();
    await ctx.pushState();
  }
}

async function openArtifact(ctx: ControllerContext, projectSlug: string, runId: string, fileName: string): Promise<void> {
  const filePath = ctx.storage().getRunArtifactPath(projectSlug, runId, fileName);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function loadRunContinuation(ctx: ControllerContext, projectSlug: string, runId: string): Promise<void> {
  const continuation = await ctx.storage().loadRunContinuationContext(projectSlug, runId);
  const resolvedRoles = resolveRoleAssignments(
    continuation.record.roleAssignments,
    continuation.record.coordinatorProvider,
    continuation.record.reviewerProviders
  );
  const legacyParticipants = deriveLegacyParticipantsFromRoles(
    resolvedRoles.all,
    continuation.record.coordinatorProvider,
    continuation.record.reviewerProviders
  );
  const preset: ContinuationPreset = {
    projectSlug,
    runId: continuation.record.id,
    projectQuestionIndex: continuation.record.projectQuestionIndex,
    question: continuation.record.question,
    draft: continuation.revisedDraft?.trim() || continuation.record.draft,
    reviewMode: continuation.record.reviewMode,
    notionRequest: "",
    roleAssignments: resolvedRoles.all,
    coordinatorProvider: legacyParticipants.coordinatorProvider,
    reviewerProviders: legacyParticipants.reviewerProviders,
    selectedDocumentIds: continuation.record.selectedDocumentIds
  };

  await ctx.sidebar.postContinuationPreset(preset);
  await ctx.sidebar.postBanner(`${runId} 실행을 이어받아 불러왔습니다.`);
}

async function startContinuationRun(ctx: ControllerContext, projectSlug: string, runId: string, continuationNote?: string): Promise<void> {
  const continuation = await ctx.storage().loadRunContinuationContext(projectSlug, runId);
  const resolvedRoles = resolveRoleAssignments(
    continuation.record.roleAssignments,
    continuation.record.coordinatorProvider,
    continuation.record.reviewerProviders
  );
  const legacyParticipants = deriveLegacyParticipantsFromRoles(
    resolvedRoles.all,
    continuation.record.coordinatorProvider,
    continuation.record.reviewerProviders
  );

  await startRun(ctx, {
    type: "runReview",
    projectSlug,
    projectQuestionIndex: continuation.record.projectQuestionIndex,
    question: continuation.record.question,
    draft: continuation.revisedDraft?.trim() || continuation.record.draft,
    reviewMode: continuation.record.reviewMode,
    notionRequest: "",
    continuationFromRunId: continuation.record.id,
    continuationNote: continuationNote?.trim() || "",
    roleAssignments: resolvedRoles.all,
    coordinatorProvider: legacyParticipants.coordinatorProvider,
    reviewerProviders: legacyParticipants.reviewerProviders,
    rounds: 1,
    selectedDocumentIds: continuation.record.selectedDocumentIds
  });
}
