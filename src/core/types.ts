export const providerIds = ["codex", "claude", "gemini"] as const;
export type ProviderId = (typeof providerIds)[number];

export const reviewerPerspectives = ["technical", "interviewer", "authenticity"] as const;
export type ReviewerPerspective = (typeof reviewerPerspectives)[number];

export const authModes = ["cli", "apiKey"] as const;
export type AuthMode = (typeof authModes)[number];

export const providerAuthStatuses = ["untested", "healthy", "unhealthy", "missing"] as const;
export type ProviderAuthStatus = (typeof providerAuthStatuses)[number];

export const sourceTypes = ["text", "txt", "md", "pdf", "pptx", "image", "other"] as const;
export type SourceType = (typeof sourceTypes)[number];

export const extractionStatuses = ["normalized", "rawOnly", "failed"] as const;
export type ExtractionStatus = (typeof extractionStatuses)[number];

export const runStatuses = ["running", "completed", "failed"] as const;
export type RunStatus = (typeof runStatuses)[number];

export const reviewModes = ["realtime", "deepFeedback"] as const;
export type ReviewMode = (typeof reviewModes)[number];

export type DocumentScope = "profile" | "project";

export interface ProviderStatus {
  providerId: ProviderId;
  installed: boolean;
  authMode: AuthMode;
  authStatus: ProviderAuthStatus;
  version?: string;
  lastCheckAt?: string;
  lastError?: string;
}

export interface ProviderSettingOption {
  value: string;
  label: string;
}

export interface ProviderCapabilities {
  modelOptions: ProviderSettingOption[];
  effortOptions: ProviderSettingOption[];
  supportsEffort: boolean;
}

export interface ContextDocument {
  id: string;
  scope: DocumentScope;
  projectSlug?: string;
  title: string;
  sourceType: SourceType;
  rawPath: string;
  normalizedPath?: string | null;
  pinnedByDefault: boolean;
  extractionStatus: ExtractionStatus;
  note?: string | null;
  createdAt: string;
}

export interface ContextManifest {
  documents: ContextDocument[];
}

export interface ProjectRecord {
  slug: string;
  companyName: string;
  roleName?: string;
  mainResponsibilities?: string;
  qualifications?: string;
  rubric: string;
  pinnedDocumentIds: string[];
  charLimit?: number;
  notionPageIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AppPreferences {
  lastCoordinatorProvider?: ProviderId;
  lastReviewMode?: ReviewMode;
}

export interface RunRecord {
  id: string;
  projectSlug: string;
  question: string;
  draft: string;
  reviewMode: ReviewMode;
  notionRequest?: string;
  notionBrief?: string;
  continuationFromRunId?: string;
  continuationNote?: string;
  coordinatorProvider: ProviderId;
  reviewerProviders: ProviderId[];
  rounds: number;
  selectedDocumentIds: string[];
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
}

export interface ReviewTurn {
  providerId: ProviderId;
  participantId?: string;
  participantLabel?: string;
  role: "reviewer" | "coordinator";
  round: number;
  prompt: string;
  response: string;
  startedAt: string;
  finishedAt?: string;
  status: "completed" | "failed";
  error?: string;
}

export interface DiscussionLedger {
  currentFocus: string;
  miniDraft: string;
  acceptedDecisions: string[];
  openChallenges: string[];
  targetSection: string;
  updatedAtRound: number;
}

export interface RunEvent {
  timestamp: string;
  type:
    | "run-started"
    | "compiled-context"
    | "turn-started"
    | "provider-stdout"
    | "provider-stderr"
    | "chat-message-started"
    | "chat-message-delta"
    | "chat-message-completed"
    | "awaiting-user-input"
    | "user-input-received"
    | "turn-completed"
    | "turn-failed"
    | "discussion-ledger-updated"
    | "run-completed"
    | "run-failed";
  providerId?: ProviderId;
  participantId?: string;
  participantLabel?: string;
  round?: number;
  messageId?: string;
  speakerRole?: ReviewTurn["role"] | "system" | "user";
  recipient?: string;
  message?: string;
  discussionLedger?: DiscussionLedger;
}

export interface RunChatMessage {
  id: string;
  providerId?: ProviderId;
  participantId?: string;
  participantLabel?: string;
  speaker: string;
  speakerRole: ReviewTurn["role"] | "system" | "user";
  recipient?: string;
  round?: number;
  content: string;
  startedAt: string;
  finishedAt?: string;
  status: "streaming" | "completed";
}

export interface PromptExecutionOptions {
  cwd: string;
  authMode: AuthMode;
  apiKey?: string;
  onEvent?: (event: RunEvent) => Promise<void> | void;
  round?: number;
  speakerRole?: ReviewTurn["role"];
  messageScope?: string;
  participantId?: string;
  participantLabel?: string;
}

export interface ProviderCommandResult {
  text: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProviderRuntimeState extends ProviderStatus {
  command: string;
  hasApiKey: boolean;
  configuredModel?: string;
  configuredEffort?: string;
  capabilities: ProviderCapabilities;
  notionMcpConfigured?: boolean;
  notionMcpConnected?: boolean;
  notionMcpMessage?: string;
}

export interface RunArtifacts {
  summary: string;
  improvementPlan: string;
  revisedDraft: string;
}

export interface RunRequest {
  projectSlug: string;
  question: string;
  draft: string;
  reviewMode: ReviewMode;
  notionRequest?: string;
  continuationFromRunId?: string;
  continuationNote?: string;
  coordinatorProvider: ProviderId;
  reviewerProviders: ProviderId[];
  rounds: number;
  selectedDocumentIds: string[];
  charLimit?: number;
}
