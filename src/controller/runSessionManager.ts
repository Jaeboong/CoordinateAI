import { UserInterventionRequest } from "../core/orchestrator";
import { ReviewMode } from "../core/types";
import { RunSessionState } from "../core/viewModels";

interface ActiveRunSession {
  state: RunSessionState;
  queuedMessages: string[];
  resolveIntervention?: (value: string | undefined) => void;
  pendingInterventionRequest?: UserInterventionRequest;
}

function runningMessage(projectSlug: string): string {
  return `Run in progress for ${projectSlug}.`;
}

function pausedMessage(request: UserInterventionRequest): string {
  const unit = request.reviewMode === "realtime" ? "round" : "cycle";
  return `Run paused after ${unit} ${request.round}.`;
}

export class RunSessionManager {
  private activeSession?: ActiveRunSession;

  assertCanStart(projectSlug: string): void {
    if (!this.activeSession) {
      return;
    }

    const current = this.activeSession.state;
    const sameProject = current.projectSlug === projectSlug;
    if (current.status === "paused") {
      throw new Error(
        sameProject
          ? "This run is paused and still waiting for intervention. Continue or finish it before starting again."
          : "Another run is paused and still waiting for intervention. Continue or finish it before starting a new run."
      );
    }

    throw new Error(
      sameProject
        ? "A run is already active for this project."
        : "Another run is already active. Only one run can be active at a time."
    );
  }

  start(projectSlug: string, reviewMode: ReviewMode): void {
    this.assertCanStart(projectSlug);
    this.activeSession = {
      state: {
        status: "running",
        projectSlug,
        reviewMode,
        message: runningMessage(projectSlug)
      },
      queuedMessages: []
    };
  }

  waitForIntervention(request: UserInterventionRequest): Promise<string | undefined> {
    if (!this.activeSession) {
      throw new Error("Cannot pause a run that has not started.");
    }

    if (this.activeSession.resolveIntervention) {
      throw new Error("A paused run is already waiting for intervention.");
    }

    return new Promise((resolve) => {
      this.activeSession = {
        state: {
          status: "paused",
          projectSlug: request.projectSlug,
          runId: request.runId,
          round: request.round,
          reviewMode: request.reviewMode,
          message: pausedMessage(request)
        },
        queuedMessages: this.activeSession?.queuedMessages ?? [],
        pendingInterventionRequest: request,
        resolveIntervention: resolve
      };
    });
  }

  submitIntervention(message: string | undefined): "queued" | "resumed" {
    if (!this.activeSession) {
      throw new Error("There is no active session waiting for input.");
    }

    const trimmed = message?.trim() || "";
    if (this.activeSession.resolveIntervention && this.activeSession.pendingInterventionRequest) {
      const { resolveIntervention, pendingInterventionRequest, queuedMessages } = this.activeSession;
      this.activeSession = {
        state: {
          status: "running",
          projectSlug: pendingInterventionRequest.projectSlug,
          runId: pendingInterventionRequest.runId,
          round: pendingInterventionRequest.round,
          reviewMode: pendingInterventionRequest.reviewMode,
          message: runningMessage(pendingInterventionRequest.projectSlug)
        },
        queuedMessages
      };
      resolveIntervention(trimmed);
      return "resumed";
    }

    if (this.activeSession.state.status !== "running") {
      throw new Error("There is no active session waiting for input.");
    }
    if (!trimmed) {
      throw new Error("Enter a message to join the discussion.");
    }

    this.activeSession.queuedMessages.push(trimmed);
    return "queued";
  }

  drainQueuedMessages(): string[] {
    if (!this.activeSession || this.activeSession.queuedMessages.length === 0) {
      return [];
    }

    const queued = [...this.activeSession.queuedMessages];
    this.activeSession.queuedMessages = [];
    return queued;
  }

  finish(): void {
    this.activeSession = undefined;
  }

  snapshot(): RunSessionState {
    return this.activeSession?.state ?? { status: "idle" };
  }
}
