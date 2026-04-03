import { z } from "zod";
import {
  AppPreferencesSchema,
  ContextDocumentSchema,
  ProjectRecordSchema,
  ProviderRuntimeStateSchema,
  RunRecordSchema
} from "./schemas";

export const RunArtifactFlagsSchema = z.object({
  summary: z.boolean(),
  improvementPlan: z.boolean(),
  revisedDraft: z.boolean(),
  finalChecks: z.boolean(),
  discussionLedger: z.boolean(),
  promptMetrics: z.boolean(),
  notionBrief: z.boolean(),
  chatMessages: z.boolean(),
  events: z.boolean()
});

export const RunPreviewSchema = z.object({
  record: RunRecordSchema,
  summaryPreview: z.string().optional(),
  artifacts: RunArtifactFlagsSchema
});

export type RunPreview = z.infer<typeof RunPreviewSchema>;

export const ProjectViewModelSchema = z.object({
  record: ProjectRecordSchema,
  documents: z.array(ContextDocumentSchema),
  runs: z.array(RunPreviewSchema)
});

export type ProjectViewModel = z.infer<typeof ProjectViewModelSchema>;

export const RunSessionStatusSchema = z.enum(["idle", "running", "paused"]);
export type RunSessionStatus = z.infer<typeof RunSessionStatusSchema>;

export const RunSessionStateSchema = z.object({
  status: RunSessionStatusSchema,
  projectSlug: z.string().optional(),
  runId: z.string().optional(),
  round: z.number().int().min(0).optional(),
  reviewMode: z.enum(["realtime", "deepFeedback"]).optional(),
  message: z.string().optional()
});

export type RunSessionState = z.infer<typeof RunSessionStateSchema>;

export const SidebarStateSchema = z.object({
  workspaceOpened: z.boolean(),
  storageRoot: z.string().optional(),
  providers: z.array(ProviderRuntimeStateSchema),
  profileDocuments: z.array(ContextDocumentSchema),
  projects: z.array(ProjectViewModelSchema),
  preferences: AppPreferencesSchema,
  busyMessage: z.string().optional(),
  runState: RunSessionStateSchema,
  defaultRubric: z.string()
});

export type SidebarState = z.infer<typeof SidebarStateSchema>;
