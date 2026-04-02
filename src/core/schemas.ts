import { z } from "zod";
import { authModes, extractionStatuses, providerAuthStatuses, providerIds, reviewModes, runStatuses, sourceTypes } from "./types";

const reviewRoles = ["reviewer", "coordinator"] as const;
const runEventTypes = [
  "run-started",
  "compiled-context",
  "turn-started",
  "provider-stdout",
  "provider-stderr",
  "chat-message-started",
  "chat-message-delta",
  "chat-message-completed",
  "awaiting-user-input",
  "user-input-received",
  "turn-completed",
  "turn-failed",
  "discussion-ledger-updated",
  "run-completed",
  "run-failed"
] as const;
const runChatSpeakerRoles = [...reviewRoles, "system", "user"] as const;

export const ProviderIdSchema = z.enum(providerIds);
export const AuthModeSchema = z.enum(authModes);
export const ProviderAuthStatusSchema = z.enum(providerAuthStatuses);
export const SourceTypeSchema = z.enum(sourceTypes);
export const ExtractionStatusSchema = z.enum(extractionStatuses);
export const RunStatusSchema = z.enum(runStatuses);
export const ReviewModeSchema = z.enum(reviewModes);
export const DiscussionLedgerSchema = z.object({
  currentFocus: z.string(),
  miniDraft: z.string(),
  acceptedDecisions: z.array(z.string()),
  openChallenges: z.array(z.string()),
  targetSection: z.string(),
  updatedAtRound: z.number().int().min(0)
});

export const ProviderStatusSchema = z.object({
  providerId: ProviderIdSchema,
  installed: z.boolean(),
  authMode: AuthModeSchema,
  authStatus: ProviderAuthStatusSchema,
  version: z.string().optional(),
  lastCheckAt: z.string().optional(),
  lastError: z.string().optional()
});

export const ProviderSettingOptionSchema = z.object({
  value: z.string(),
  label: z.string()
});

export const ProviderCapabilitiesSchema = z.object({
  modelOptions: z.array(ProviderSettingOptionSchema),
  effortOptions: z.array(ProviderSettingOptionSchema),
  supportsEffort: z.boolean()
});

export const ProviderRuntimeStateSchema = ProviderStatusSchema.extend({
  command: z.string(),
  hasApiKey: z.boolean(),
  configuredModel: z.string().optional(),
  configuredEffort: z.string().optional(),
  capabilities: ProviderCapabilitiesSchema,
  notionMcpConfigured: z.boolean().optional(),
  notionMcpConnected: z.boolean().optional(),
  notionMcpMessage: z.string().optional()
});

export const ContextDocumentSchema = z.object({
  id: z.string(),
  scope: z.enum(["profile", "project"]),
  projectSlug: z.string().optional(),
  title: z.string(),
  sourceType: SourceTypeSchema,
  rawPath: z.string(),
  normalizedPath: z.string().nullable().optional(),
  pinnedByDefault: z.boolean(),
  extractionStatus: ExtractionStatusSchema,
  note: z.string().nullable().optional(),
  createdAt: z.string()
});

export const ContextManifestSchema = z.object({
  documents: z.array(ContextDocumentSchema)
});

export const ProjectRecordSchema = z.object({
  slug: z.string(),
  companyName: z.string(),
  roleName: z.string().optional(),
  mainResponsibilities: z.string().optional(),
  qualifications: z.string().optional(),
  rubric: z.string(),
  pinnedDocumentIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AppPreferencesSchema = z.object({
  lastCoordinatorProvider: ProviderIdSchema.optional(),
  lastReviewMode: ReviewModeSchema.optional()
});

export const RunRecordSchema = z.object({
  id: z.string(),
  projectSlug: z.string(),
  question: z.string(),
  draft: z.string(),
  reviewMode: ReviewModeSchema.default("deepFeedback"),
  notionRequest: z.string().optional(),
  notionBrief: z.string().optional(),
  continuationFromRunId: z.string().optional(),
  continuationNote: z.string().optional(),
  coordinatorProvider: ProviderIdSchema,
  reviewerProviders: z.array(ProviderIdSchema),
  rounds: z.number().int().min(0),
  selectedDocumentIds: z.array(z.string()),
  status: RunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional()
});

export const ReviewTurnSchema = z.object({
  providerId: ProviderIdSchema,
  participantId: z.string().optional(),
  participantLabel: z.string().optional(),
  role: z.enum(reviewRoles),
  round: z.number().int().min(0),
  prompt: z.string(),
  response: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional()
});

export const RunChatMessageSchema = z.object({
  id: z.string(),
  providerId: ProviderIdSchema.optional(),
  participantId: z.string().optional(),
  participantLabel: z.string().optional(),
  speaker: z.string(),
  speakerRole: z.enum(runChatSpeakerRoles),
  recipient: z.string().optional(),
  round: z.number().int().min(0).optional(),
  content: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["streaming", "completed"])
});

export const RunEventSchema = z.object({
  timestamp: z.string(),
  type: z.enum(runEventTypes),
  providerId: ProviderIdSchema.optional(),
  participantId: z.string().optional(),
  participantLabel: z.string().optional(),
  round: z.number().int().min(0).optional(),
  messageId: z.string().optional(),
  speakerRole: z.enum(runChatSpeakerRoles).optional(),
  recipient: z.string().optional(),
  message: z.string().optional(),
  discussionLedger: DiscussionLedgerSchema.optional()
});
