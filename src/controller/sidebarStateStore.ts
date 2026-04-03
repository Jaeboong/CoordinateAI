import * as path from "node:path";
import { defaultRubric, ForJobStorage } from "../core/storage";
import { ProviderId, ProviderRuntimeState } from "../core/types";
import { ProjectViewModel, RunSessionState, SidebarState, SidebarStateSchema } from "../core/viewModels";
import { ProviderRegistry } from "../core/providers";

interface StateStoreOptions {
  workspaceRoot?: string;
  storage?: ForJobStorage;
  registry?: Pick<ProviderRegistry, "listRuntimeStates" | "refreshRuntimeState">;
}

export class SidebarStateStore {
  private providers: ProviderRuntimeState[] = [];
  private profileDocuments = [] as SidebarState["profileDocuments"];
  private projects: ProjectViewModel[] = [];
  private preferences: SidebarState["preferences"] = {};
  private busyMessage?: string;
  private runState: RunSessionState = { status: "idle" };

  constructor(private readonly options: StateStoreOptions) {}

  async initialize(): Promise<void> {
    if (!this.options.storage) {
      return;
    }

    await this.options.storage.ensureInitialized();
    await Promise.all([
      this.refreshProviders(true),
      this.refreshProfileDocuments(),
      this.refreshProjects(),
      this.refreshPreferences()
    ]);
  }

  async refreshAll(options: { refreshProviders?: boolean } = {}): Promise<void> {
    if (!this.options.storage) {
      return;
    }

    await Promise.all([
      this.refreshProviders(Boolean(options.refreshProviders)),
      this.refreshProfileDocuments(),
      this.refreshProjects(),
      this.refreshPreferences()
    ]);
  }

  async refreshProviders(refresh = false): Promise<void> {
    if (!this.options.registry) {
      this.providers = [];
      return;
    }

    this.providers = await this.options.registry.listRuntimeStates({ refresh });
  }

  async refreshProvider(providerId: ProviderId): Promise<void> {
    if (!this.options.registry) {
      return;
    }

    const nextState = await this.options.registry.refreshRuntimeState(providerId);
    const next = new Map(this.providers.map((provider) => [provider.providerId, provider]));
    next.set(providerId, nextState);
    this.providers = [...next.values()];
  }

  async refreshProfileDocuments(): Promise<void> {
    this.profileDocuments = this.options.storage ? await this.options.storage.listProfileDocuments() : [];
  }

  async refreshPreferences(): Promise<void> {
    this.preferences = this.options.storage ? await this.options.storage.getPreferences() : {};
  }

  async refreshProjects(projectSlug?: string): Promise<void> {
    if (!this.options.storage) {
      this.projects = [];
      return;
    }

    const records = await this.options.storage.listProjects();
    const cachedBySlug = new Map(this.projects.map((project) => [project.record.slug, project]));
    const shouldReuseCache = projectSlug && this.projects.length > 0;
    const nextProjects: ProjectViewModel[] = [];

    for (const record of records) {
      const cached = cachedBySlug.get(record.slug);
      if (shouldReuseCache && cached && record.slug !== projectSlug) {
        nextProjects.push({
          ...cached,
          record
        });
        continue;
      }

      nextProjects.push(await this.loadProject(record.slug, record));
    }

    this.projects = nextProjects;
  }

  setBusyMessage(message?: string): void {
    this.busyMessage = message;
  }

  setRunState(state: RunSessionState): void {
    this.runState = state;
  }

  snapshot(): SidebarState {
    return SidebarStateSchema.parse({
      workspaceOpened: Boolean(this.options.storage && this.options.workspaceRoot),
      storageRoot: this.options.storage && this.options.workspaceRoot
        ? path.relative(this.options.workspaceRoot, this.options.storage.storageRoot) || "."
        : undefined,
      providers: this.providers,
      profileDocuments: this.profileDocuments,
      projects: this.projects,
      preferences: this.preferences,
      busyMessage: this.busyMessage,
      runState: this.runState,
      defaultRubric: defaultRubric()
    });
  }

  private async loadProject(projectSlug: string, record?: ProjectViewModel["record"]): Promise<ProjectViewModel> {
    if (!this.options.storage) {
      throw new Error("Storage is unavailable.");
    }

    const projectRecord = record ?? (await this.options.storage.getProject(projectSlug));
    const [documents, runs] = await Promise.all([
      this.options.storage.listProjectDocuments(projectSlug),
      this.options.storage.listRuns(projectSlug)
    ]);

    const runPreviews = await Promise.all(
      runs.map(async (run) => {
        const [summary, improvementPlan, revisedDraft, finalChecks, discussionLedger, promptMetrics, notionBrief, chatMessages, events] = await Promise.all([
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "summary.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "improvement-plan.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "revised-draft.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "final-checks.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "discussion-ledger.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "prompt-metrics.json"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "notion-brief.md"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "chat-messages.json"),
          this.options.storage!.readOptionalRunArtifact(projectSlug, run.id, "events.ndjson")
        ]);

        return {
          record: run,
          summaryPreview: (summary || finalChecks || (run.reviewMode === "realtime" ? revisedDraft : undefined))?.slice(0, 400),
          artifacts: {
            summary: Boolean(summary),
            improvementPlan: Boolean(improvementPlan),
            revisedDraft: Boolean(revisedDraft),
            finalChecks: Boolean(finalChecks),
            discussionLedger: Boolean(discussionLedger),
            promptMetrics: Boolean(promptMetrics),
            notionBrief: Boolean(notionBrief),
            chatMessages: Boolean(chatMessages),
            events: Boolean(events)
          }
        };
      })
    );

    return {
      record: projectRecord,
      documents,
      runs: runPreviews
    };
  }
}
