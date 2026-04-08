import {
  AppPreferences,
  ContextDocument,
  ProviderId,
  ProviderStatus,
  ProjectRecord,
  RunChatMessage,
  RunEvent,
  RunRecord,
  ReviewTurn
} from "./types";
import { RunContinuationContext } from "./storage";

/**
 * Narrow interface for ProviderRegistry: only provider status persistence.
 */
export interface ProviderStore {
  readonly storageRoot: string;
  loadProviderStatuses(): Promise<Record<ProviderId, ProviderStatus | undefined>>;
  saveProviderStatus(status: ProviderStatus): Promise<void>;
}

/**
 * Narrow interface for ContextCompiler: only normalized document content reading.
 */
export interface DocumentContentReader {
  readDocumentNormalizedContent(document: ContextDocument): Promise<string | undefined>;
}

/**
 * Narrow interface for SidebarStateStore: state aggregation queries.
 */
export interface StateStoreStorage {
  readonly storageRoot: string;
  ensureInitialized(): Promise<void>;
  getPreferences(): Promise<AppPreferences>;
  listProfileDocuments(): Promise<ContextDocument[]>;
  listProjects(): Promise<ProjectRecord[]>;
  getProject(projectSlug: string): Promise<ProjectRecord>;
  listProjectDocuments(projectSlug: string): Promise<ContextDocument[]>;
  readDocumentRawContent(document: ContextDocument): Promise<string | undefined>;
  listRuns(projectSlug: string): Promise<RunRecord[]>;
  readOptionalRunArtifact(projectSlug: string, runId: string, fileName: string): Promise<string | undefined>;
}

/**
 * Narrow interface for ReviewOrchestrator: run lifecycle operations.
 */
export interface RunStore {
  readonly storageRoot: string;
  getProject(projectSlug: string): Promise<ProjectRecord>;
  listProfileDocuments(): Promise<ContextDocument[]>;
  listProjectDocuments(projectSlug: string): Promise<ContextDocument[]>;
  loadRunContinuationContext(projectSlug: string, runId: string): Promise<RunContinuationContext>;
  createRun(record: RunRecord): Promise<string>;
  updateRun(projectSlug: string, runId: string, updates: Partial<RunRecord>): Promise<RunRecord>;
  setLastCoordinatorProvider(providerId: ProviderId): Promise<void>;
  setLastReviewMode(reviewMode: AppPreferences["lastReviewMode"]): Promise<void>;
  saveRunTextArtifact(projectSlug: string, runId: string, fileName: string, content: string): Promise<string>;
  appendRunEvent(projectSlug: string, runId: string, event: RunEvent): Promise<void>;
  saveReviewTurns(projectSlug: string, runId: string, turns: ReviewTurn[]): Promise<void>;
  saveRunChatMessages(projectSlug: string, runId: string, messages: RunChatMessage[]): Promise<void>;
}
