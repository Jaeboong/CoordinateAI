import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AppPreferences,
  ContextDocument,
  ContextManifest,
  ProjectRecord,
  ProviderId,
  ProviderStatus,
  RunChatMessage,
  ReviewTurn,
  RunEvent,
  RunRecord
} from "./types";
import {
  AppPreferencesSchema,
  ContextManifestSchema,
  ProjectRecordSchema,
  ProviderStatusSchema,
  RunChatMessageSchema,
  ReviewTurnSchema,
  RunRecordSchema
} from "./schemas";
import { ContextExtractor, inferSourceType } from "./contextExtractor";
import {
  createId,
  ensureDir,
  fileExists,
  nowIso,
  readJsonFile,
  relativeFrom,
  sanitizeFileSegment,
  slugify,
  writeJsonFile
} from "./utils";

interface DocumentTarget {
  scope: "profile" | "project";
  projectSlug?: string;
}

export interface RunContinuationContext {
  record: RunRecord;
  summary?: string;
  improvementPlan?: string;
  revisedDraft?: string;
  notionBrief?: string;
  chatMessages?: RunChatMessage[];
}

export class ForJobStorage {
  constructor(
    private readonly workspaceRoot: string,
    private readonly storageRootName: string,
    private readonly extractor: ContextExtractor = new ContextExtractor()
  ) {}

  get storageRoot(): string {
    return path.isAbsolute(this.storageRootName) ? this.storageRootName : path.join(this.workspaceRoot, this.storageRootName);
  }

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      ensureDir(this.profileRawDir()),
      ensureDir(this.profileNormalizedDir()),
      ensureDir(this.projectsDir()),
      ensureDir(this.providersDir())
    ]);

    if (!(await fileExists(this.profileManifestPath()))) {
      await writeJsonFile(this.profileManifestPath(), { documents: [] satisfies ContextDocument[] });
    }

    if (!(await fileExists(this.providerStatusesPath()))) {
      await writeJsonFile(this.providerStatusesPath(), {});
    }

    if (!(await fileExists(this.preferencesPath()))) {
      await writeJsonFile(this.preferencesPath(), {});
    }
  }

  async listProfileDocuments(): Promise<ContextDocument[]> {
    const manifest = await this.loadManifest(this.profileManifestPath());
    return manifest.documents.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveProfileTextDocument(title: string, content: string, pinnedByDefault = false, note?: string): Promise<ContextDocument> {
    return this.saveTextDocument({ scope: "profile" }, title, content, pinnedByDefault, note);
  }

  async importProfileFile(sourceFilePath: string, pinnedByDefault = false, note?: string): Promise<ContextDocument> {
    return this.importFileDocument({ scope: "profile" }, sourceFilePath, pinnedByDefault, note);
  }

  async importProfileUpload(fileName: string, bytes: Uint8Array, pinnedByDefault = false, note?: string): Promise<ContextDocument> {
    return this.importBufferDocument({ scope: "profile" }, fileName, bytes, pinnedByDefault, note);
  }

  async setProfileDocumentPinned(documentId: string, pinned: boolean): Promise<void> {
    const manifest = await this.loadManifest(this.profileManifestPath());
    manifest.documents = manifest.documents.map((document) =>
      document.id === documentId ? { ...document, pinnedByDefault: pinned } : document
    );
    await this.saveManifest(this.profileManifestPath(), manifest);
  }

  async listProjects(): Promise<ProjectRecord[]> {
    try {
      const entries = await fs.readdir(this.projectsDir(), { withFileTypes: true });
      const projects: ProjectRecord[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const projectPath = path.join(this.projectsDir(), entry.name, "project.json");
        if (!(await fileExists(projectPath))) {
          continue;
        }

        const rawProject = await readJsonFile(projectPath, {});
        projects.push(ProjectRecordSchema.parse(rawProject));
      }

      return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async getProject(projectSlug: string): Promise<ProjectRecord> {
    const rawProject = await readJsonFile(this.projectFilePath(projectSlug), {});
    return ProjectRecordSchema.parse(rawProject);
  }

  async createProject(
    companyName: string,
    roleName?: string,
    mainResponsibilities?: string,
    qualifications?: string
  ): Promise<ProjectRecord> {
    await this.ensureInitialized();
    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    let counter = 1;

    while (await fileExists(this.projectDir(slug))) {
      slug = `${baseSlug}-${counter += 1}`;
    }

    const now = nowIso();
    const project: ProjectRecord = {
      slug,
      companyName,
      roleName: roleName?.trim() || undefined,
      mainResponsibilities: mainResponsibilities?.trim() || undefined,
      qualifications: qualifications?.trim() || undefined,
      rubric: defaultRubric(),
      pinnedDocumentIds: [],
      createdAt: now,
      updatedAt: now
    };

    await Promise.all([
      ensureDir(this.projectRawDir(slug)),
      ensureDir(this.projectNormalizedDir(slug)),
      ensureDir(this.projectRunsDir(slug))
    ]);
    await writeJsonFile(this.projectContextManifestPath(slug), { documents: [] satisfies ContextDocument[] });
    await writeJsonFile(this.projectFilePath(slug), project);
    return project;
  }

  async updateProject(project: ProjectRecord): Promise<ProjectRecord> {
    const updated = { ...project, updatedAt: nowIso() };
    await writeJsonFile(this.projectFilePath(project.slug), updated);
    return updated;
  }

  async updateProjectInfo(
    projectSlug: string,
    companyName: string,
    roleName?: string,
    mainResponsibilities?: string,
    qualifications?: string
  ): Promise<ProjectRecord> {
    const project = await this.getProject(projectSlug);
    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName) {
      throw new Error("Project company name cannot be empty.");
    }

    return this.updateProject({
      ...project,
      companyName: trimmedCompanyName,
      roleName: roleName?.trim() || undefined,
      mainResponsibilities: mainResponsibilities?.trim() || undefined,
      qualifications: qualifications?.trim() || undefined
    });
  }

  async deleteProject(projectSlug: string): Promise<void> {
    await fs.rm(this.projectDir(projectSlug), { recursive: true, force: true });
  }

  async updateProjectRubric(projectSlug: string, rubric: string): Promise<ProjectRecord> {
    const project = await this.getProject(projectSlug);
    return this.updateProject({ ...project, rubric });
  }

  async listProjectDocuments(projectSlug: string): Promise<ContextDocument[]> {
    const manifest = await this.loadManifest(this.projectContextManifestPath(projectSlug));
    return manifest.documents.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveProjectTextDocument(
    projectSlug: string,
    title: string,
    content: string,
    pinnedByDefault = false,
    note?: string
  ): Promise<ContextDocument> {
    return this.saveTextDocument({ scope: "project", projectSlug }, title, content, pinnedByDefault, note);
  }

  async importProjectFile(projectSlug: string, sourceFilePath: string, pinnedByDefault = false, note?: string): Promise<ContextDocument> {
    return this.importFileDocument({ scope: "project", projectSlug }, sourceFilePath, pinnedByDefault, note);
  }

  async importProjectUpload(
    projectSlug: string,
    fileName: string,
    bytes: Uint8Array,
    pinnedByDefault = false,
    note?: string
  ): Promise<ContextDocument> {
    return this.importBufferDocument({ scope: "project", projectSlug }, fileName, bytes, pinnedByDefault, note);
  }

  async setProjectDocumentPinned(projectSlug: string, documentId: string, pinned: boolean): Promise<void> {
    const manifestPath = this.projectContextManifestPath(projectSlug);
    const manifest = await this.loadManifest(manifestPath);
    manifest.documents = manifest.documents.map((document) =>
      document.id === documentId ? { ...document, pinnedByDefault: pinned } : document
    );
    await this.saveManifest(manifestPath, manifest);

    const project = await this.getProject(projectSlug);
    const current = new Set(project.pinnedDocumentIds);
    if (pinned) {
      current.add(documentId);
    } else {
      current.delete(documentId);
    }

    await this.updateProject({ ...project, pinnedDocumentIds: [...current] });
  }

  async getProjectDocument(projectSlug: string, documentId: string): Promise<ContextDocument> {
    const manifest = await this.loadManifest(this.projectContextManifestPath(projectSlug));
    const document = manifest.documents.find((item) => item.id === documentId);
    if (!document) {
      throw new Error(`Project document not found: ${documentId}`);
    }

    return document;
  }

  async readDocumentRawContent(document: ContextDocument): Promise<string | undefined> {
    if (!["text", "txt", "md"].includes(document.sourceType)) {
      return undefined;
    }

    const filePath = this.resolveStoredPath(document.rawPath);
    if (!(await fileExists(filePath))) {
      return undefined;
    }

    return fs.readFile(filePath, "utf8");
  }

  async updateProjectDocument(
    projectSlug: string,
    documentId: string,
    updates: {
      title: string;
      note?: string;
      pinnedByDefault: boolean;
      content?: string;
    }
  ): Promise<ContextDocument> {
    const manifestPath = this.projectContextManifestPath(projectSlug);
    const manifest = await this.loadManifest(manifestPath);
    const documentIndex = manifest.documents.findIndex((item) => item.id === documentId);
    if (documentIndex < 0) {
      throw new Error(`Project document not found: ${documentId}`);
    }

    const existing = manifest.documents[documentIndex];
    const updated: ContextDocument = {
      ...existing,
      title: updates.title.trim() || existing.title,
      note: updates.note?.trim() || undefined,
      pinnedByDefault: updates.pinnedByDefault
    };

    if (updates.content !== undefined) {
      if (!["text", "txt", "md"].includes(existing.sourceType)) {
        throw new Error("Only text-based project documents can be edited in place.");
      }

      const rawFilePath = this.resolveStoredPath(existing.rawPath);
      await fs.writeFile(rawFilePath, updates.content, "utf8");

      const normalizedPath = existing.normalizedPath
        ? this.resolveStoredPath(existing.normalizedPath)
        : path.join(this.projectNormalizedDir(projectSlug), `${sanitizeFileSegment(`${slugify(updated.title)}-${existing.id}`)}.md`);
      await fs.writeFile(normalizedPath, updates.content.trim(), "utf8");
      updated.normalizedPath = relativeFrom(this.workspaceRoot, normalizedPath);
      updated.extractionStatus = "normalized";
    }

    manifest.documents[documentIndex] = updated;
    await this.saveManifest(manifestPath, manifest);

    const project = await this.getProject(projectSlug);
    const pinned = new Set(project.pinnedDocumentIds);
    if (updated.pinnedByDefault) {
      pinned.add(updated.id);
    } else {
      pinned.delete(updated.id);
    }
    await this.updateProject({ ...project, pinnedDocumentIds: [...pinned] });
    return updated;
  }

  async deleteProjectDocument(projectSlug: string, documentId: string): Promise<void> {
    const manifestPath = this.projectContextManifestPath(projectSlug);
    const manifest = await this.loadManifest(manifestPath);
    const document = manifest.documents.find((item) => item.id === documentId);
    if (!document) {
      throw new Error(`Project document not found: ${documentId}`);
    }

    manifest.documents = manifest.documents.filter((item) => item.id !== documentId);
    await this.saveManifest(manifestPath, manifest);

    const rawFilePath = this.resolveStoredPath(document.rawPath);
    await fs.rm(rawFilePath, { force: true });
    if (document.normalizedPath) {
      await fs.rm(this.resolveStoredPath(document.normalizedPath), { force: true });
    }

    const project = await this.getProject(projectSlug);
    const pinned = new Set(project.pinnedDocumentIds);
    pinned.delete(documentId);
    await this.updateProject({ ...project, pinnedDocumentIds: [...pinned] });
  }

  async loadProviderStatuses(): Promise<Record<ProviderId, ProviderStatus | undefined>> {
    const raw = await readJsonFile<Record<string, unknown>>(this.providerStatusesPath(), {});
    const parsed: Record<ProviderId, ProviderStatus | undefined> = {
      codex: undefined,
      claude: undefined,
      gemini: undefined
    };

    for (const providerId of ["codex", "claude", "gemini"] as const) {
      const value = raw[providerId];
      if (value) {
        parsed[providerId] = ProviderStatusSchema.parse(value);
      }
    }

    return parsed;
  }

  async saveProviderStatus(status: ProviderStatus): Promise<void> {
    const current = await readJsonFile<Record<string, ProviderStatus>>(this.providerStatusesPath(), {});
    current[status.providerId] = status;
    await writeJsonFile(this.providerStatusesPath(), current);
  }

  async getPreferences(): Promise<AppPreferences> {
    const raw = await readJsonFile<Record<string, unknown>>(this.preferencesPath(), {});
    return AppPreferencesSchema.parse(raw);
  }

  async setLastCoordinatorProvider(providerId: ProviderId): Promise<void> {
    const preferences = await this.getPreferences();
    await writeJsonFile(this.preferencesPath(), { ...preferences, lastCoordinatorProvider: providerId });
  }

  async setLastReviewMode(reviewMode: AppPreferences["lastReviewMode"]): Promise<void> {
    const preferences = await this.getPreferences();
    await writeJsonFile(this.preferencesPath(), { ...preferences, lastReviewMode: reviewMode });
  }

  async createRun(record: RunRecord): Promise<string> {
    const runDir = this.runDir(record.projectSlug, record.id);
    await ensureDir(runDir);
    await writeJsonFile(path.join(runDir, "input.json"), record);
    return runDir;
  }

  async updateRun(projectSlug: string, runId: string, updates: Partial<RunRecord>): Promise<RunRecord> {
    const existing = await this.getRun(projectSlug, runId);
    const merged = RunRecordSchema.parse({ ...existing, ...updates });
    await writeJsonFile(path.join(this.runDir(projectSlug, runId), "input.json"), merged);
    return merged;
  }

  async getRun(projectSlug: string, runId: string): Promise<RunRecord> {
    const raw = await readJsonFile(path.join(this.runDir(projectSlug, runId), "input.json"), {});
    return RunRecordSchema.parse(raw);
  }

  async listRuns(projectSlug: string): Promise<RunRecord[]> {
    try {
      const entries = await fs.readdir(this.projectRunsDir(projectSlug), { withFileTypes: true });
      const runs: RunRecord[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const inputPath = path.join(this.projectRunsDir(projectSlug), entry.name, "input.json");
        if (!(await fileExists(inputPath))) {
          continue;
        }

        const raw = await readJsonFile(inputPath, {});
        runs.push(RunRecordSchema.parse(raw));
      }

      return runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async saveRunTextArtifact(projectSlug: string, runId: string, fileName: string, content: string): Promise<string> {
    const artifactPath = path.join(this.runDir(projectSlug, runId), fileName);
    await fs.writeFile(artifactPath, content, "utf8");
    return artifactPath;
  }

  async appendRunEvent(projectSlug: string, runId: string, event: RunEvent): Promise<void> {
    const artifactPath = path.join(this.runDir(projectSlug, runId), "events.ndjson");
    await fs.appendFile(artifactPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  async saveReviewTurns(projectSlug: string, runId: string, turns: ReviewTurn[]): Promise<void> {
    ReviewTurnSchema.array().parse(turns);
    await writeJsonFile(path.join(this.runDir(projectSlug, runId), "review-turns.json"), turns);
  }

  async saveRunChatMessages(projectSlug: string, runId: string, messages: RunChatMessage[]): Promise<void> {
    RunChatMessageSchema.array().parse(messages);
    await writeJsonFile(path.join(this.runDir(projectSlug, runId), "chat-messages.json"), messages);
  }

  async readOptionalRunArtifact(projectSlug: string, runId: string, fileName: string): Promise<string | undefined> {
    const artifactPath = path.join(this.runDir(projectSlug, runId), fileName);
    if (!(await fileExists(artifactPath))) {
      return undefined;
    }

    return fs.readFile(artifactPath, "utf8");
  }

  async loadRunContinuationContext(projectSlug: string, runId: string): Promise<RunContinuationContext> {
    const [record, summary, improvementPlan, revisedDraft, notionBrief, chatMessagesRaw] = await Promise.all([
      this.getRun(projectSlug, runId),
      this.readOptionalRunArtifact(projectSlug, runId, "summary.md"),
      this.readOptionalRunArtifact(projectSlug, runId, "improvement-plan.md"),
      this.readOptionalRunArtifact(projectSlug, runId, "revised-draft.md"),
      this.readOptionalRunArtifact(projectSlug, runId, "notion-brief.md"),
      this.readOptionalRunArtifact(projectSlug, runId, "chat-messages.json")
    ]);

    let chatMessages: RunChatMessage[] | undefined;
    if (chatMessagesRaw) {
      chatMessages = RunChatMessageSchema.array().parse(JSON.parse(chatMessagesRaw));
    }

    return {
      record,
      summary,
      improvementPlan,
      revisedDraft,
      notionBrief,
      chatMessages
    };
  }

  async readDocumentNormalizedContent(document: ContextDocument): Promise<string | undefined> {
    if (!document.normalizedPath) {
      return undefined;
    }

    const filePath = this.resolveStoredPath(document.normalizedPath);
    if (!(await fileExists(filePath))) {
      return undefined;
    }

    return fs.readFile(filePath, "utf8");
  }

  resolveStoredPath(storedPath: string): string {
    return path.join(this.workspaceRoot, storedPath);
  }

  getRunArtifactPath(projectSlug: string, runId: string, fileName: string): string {
    return path.join(this.runDir(projectSlug, runId), fileName);
  }

  private async saveTextDocument(
    target: DocumentTarget,
    title: string,
    content: string,
    pinnedByDefault: boolean,
    note?: string
  ): Promise<ContextDocument> {
    await this.ensureInitialized();
    if (target.scope === "project" && target.projectSlug) {
      await this.ensureProjectDirs(target.projectSlug);
    }

    const id = createId();
    const fileNameBase = sanitizeFileSegment(`${slugify(title)}-${id}`);
    const rawDir = this.rawDirForTarget(target);
    const normalizedDir = this.normalizedDirForTarget(target);
    const rawFilePath = path.join(rawDir, `${fileNameBase}.txt`);
    const normalizedFilePath = path.join(normalizedDir, `${fileNameBase}.md`);

    await fs.writeFile(rawFilePath, content, "utf8");
    await fs.writeFile(normalizedFilePath, content.trim(), "utf8");

    const document: ContextDocument = {
      id,
      scope: target.scope,
      projectSlug: target.projectSlug,
      title,
      sourceType: "text",
      rawPath: relativeFrom(this.workspaceRoot, rawFilePath),
      normalizedPath: relativeFrom(this.workspaceRoot, normalizedFilePath),
      pinnedByDefault,
      extractionStatus: "normalized",
      note: note?.trim() || undefined,
      createdAt: nowIso()
    };

    await this.persistDocument(target, document);
    return document;
  }

  private async importFileDocument(
    target: DocumentTarget,
    sourceFilePath: string,
    pinnedByDefault: boolean,
    note?: string
  ): Promise<ContextDocument> {
    await this.ensureInitialized();
    if (target.scope === "project" && target.projectSlug) {
      await this.ensureProjectDirs(target.projectSlug);
    }

    const sourceType = inferSourceType(sourceFilePath);
    const id = createId();
    const originalExtension = path.extname(sourceFilePath);
    const fileNameBase = sanitizeFileSegment(`${path.basename(sourceFilePath, originalExtension)}-${id}`);
    const rawDir = this.rawDirForTarget(target);
    const normalizedDir = this.normalizedDirForTarget(target);
    const rawFilePath = path.join(rawDir, `${fileNameBase}${originalExtension.toLowerCase()}`);

    await fs.copyFile(sourceFilePath, rawFilePath);

    let normalizedPath: string | null = null;
    let extractionStatus: ContextDocument["extractionStatus"] = "rawOnly";
    try {
      const extracted = await this.extractor.extract(rawFilePath, sourceType);
      extractionStatus = extracted.extractionStatus;
      if (extracted.content) {
        const normalizedFilePath = path.join(normalizedDir, `${fileNameBase}.md`);
        await fs.writeFile(normalizedFilePath, extracted.content, "utf8");
        normalizedPath = relativeFrom(this.workspaceRoot, normalizedFilePath);
      }
    } catch (error) {
      extractionStatus = "failed";
      note = note ? `${note}\n\nExtraction error: ${(error as Error).message}` : `Extraction error: ${(error as Error).message}`;
    }

    const document: ContextDocument = {
      id,
      scope: target.scope,
      projectSlug: target.projectSlug,
      title: path.basename(sourceFilePath),
      sourceType,
      rawPath: relativeFrom(this.workspaceRoot, rawFilePath),
      normalizedPath,
      pinnedByDefault,
      extractionStatus,
      note: note?.trim() || undefined,
      createdAt: nowIso()
    };

    await this.persistDocument(target, document);
    return document;
  }

  private async importBufferDocument(
    target: DocumentTarget,
    fileName: string,
    bytes: Uint8Array,
    pinnedByDefault: boolean,
    note?: string
  ): Promise<ContextDocument> {
    await this.ensureInitialized();
    if (target.scope === "project" && target.projectSlug) {
      await this.ensureProjectDirs(target.projectSlug);
    }

    const sourceType = inferSourceType(fileName);
    const id = createId();
    const originalExtension = path.extname(fileName);
    const fileNameBase = sanitizeFileSegment(`${path.basename(fileName, originalExtension)}-${id}`);
    const rawDir = this.rawDirForTarget(target);
    const normalizedDir = this.normalizedDirForTarget(target);
    const rawFilePath = path.join(rawDir, `${fileNameBase}${originalExtension.toLowerCase()}`);

    await fs.writeFile(rawFilePath, Buffer.from(bytes));

    let normalizedPath: string | null = null;
    let extractionStatus: ContextDocument["extractionStatus"] = "rawOnly";
    try {
      const extracted = await this.extractor.extract(rawFilePath, sourceType);
      extractionStatus = extracted.extractionStatus;
      if (extracted.content) {
        const normalizedFilePath = path.join(normalizedDir, `${fileNameBase}.md`);
        await fs.writeFile(normalizedFilePath, extracted.content, "utf8");
        normalizedPath = relativeFrom(this.workspaceRoot, normalizedFilePath);
      }
    } catch (error) {
      extractionStatus = "failed";
      note = note ? `${note}\n\nExtraction error: ${(error as Error).message}` : `Extraction error: ${(error as Error).message}`;
    }

    const document: ContextDocument = {
      id,
      scope: target.scope,
      projectSlug: target.projectSlug,
      title: path.basename(fileName),
      sourceType,
      rawPath: relativeFrom(this.workspaceRoot, rawFilePath),
      normalizedPath,
      pinnedByDefault,
      extractionStatus,
      note: note?.trim() || undefined,
      createdAt: nowIso()
    };

    await this.persistDocument(target, document);
    return document;
  }

  private async persistDocument(target: DocumentTarget, document: ContextDocument): Promise<void> {
    const manifestPath = target.scope === "profile" ? this.profileManifestPath() : this.projectContextManifestPath(target.projectSlug!);
    const manifest = await this.loadManifest(manifestPath);
    manifest.documents.unshift(document);
    await this.saveManifest(manifestPath, manifest);

    if (target.scope === "project" && target.projectSlug && document.pinnedByDefault) {
      const project = await this.getProject(target.projectSlug);
      const pinned = new Set(project.pinnedDocumentIds);
      pinned.add(document.id);
      await this.updateProject({ ...project, pinnedDocumentIds: [...pinned] });
    }
  }

  private async loadManifest(manifestPath: string): Promise<ContextManifest> {
    const raw = await readJsonFile(manifestPath, { documents: [] });
    return ContextManifestSchema.parse(raw);
  }

  private async saveManifest(manifestPath: string, manifest: ContextManifest): Promise<void> {
    await writeJsonFile(manifestPath, ContextManifestSchema.parse(manifest));
  }

  private async ensureProjectDirs(projectSlug: string): Promise<void> {
    await Promise.all([ensureDir(this.projectRawDir(projectSlug)), ensureDir(this.projectNormalizedDir(projectSlug)), ensureDir(this.projectRunsDir(projectSlug))]);

    if (!(await fileExists(this.projectContextManifestPath(projectSlug)))) {
      await writeJsonFile(this.projectContextManifestPath(projectSlug), { documents: [] satisfies ContextDocument[] });
    }
  }

  private profileRawDir(): string {
    return path.join(this.storageRoot, "profile", "raw");
  }

  private profileNormalizedDir(): string {
    return path.join(this.storageRoot, "profile", "normalized");
  }

  private profileManifestPath(): string {
    return path.join(this.storageRoot, "profile", "manifest.json");
  }

  private projectsDir(): string {
    return path.join(this.storageRoot, "projects");
  }

  private projectDir(projectSlug: string): string {
    return path.join(this.projectsDir(), projectSlug);
  }

  private projectRawDir(projectSlug: string): string {
    return path.join(this.projectDir(projectSlug), "context", "raw");
  }

  private projectNormalizedDir(projectSlug: string): string {
    return path.join(this.projectDir(projectSlug), "context", "normalized");
  }

  private projectContextManifestPath(projectSlug: string): string {
    return path.join(this.projectDir(projectSlug), "context", "manifest.json");
  }

  private projectRunsDir(projectSlug: string): string {
    return path.join(this.projectDir(projectSlug), "runs");
  }

  private runDir(projectSlug: string, runId: string): string {
    return path.join(this.projectRunsDir(projectSlug), runId);
  }

  private projectFilePath(projectSlug: string): string {
    return path.join(this.projectDir(projectSlug), "project.json");
  }

  private providersDir(): string {
    return path.join(this.storageRoot, "providers");
  }

  private providerStatusesPath(): string {
    return path.join(this.providersDir(), "status.json");
  }

  private preferencesPath(): string {
    return path.join(this.storageRoot, "preferences.json");
  }

  private rawDirForTarget(target: DocumentTarget): string {
    return target.scope === "profile" ? this.profileRawDir() : this.projectRawDir(target.projectSlug!);
  }

  private normalizedDirForTarget(target: DocumentTarget): string {
    return target.scope === "profile" ? this.profileNormalizedDir() : this.projectNormalizedDir(target.projectSlug!);
  }
}

export function defaultRubric(): string {
  return [
    "- question fit",
    "- specificity/evidence",
    "- impact/metrics",
    "- role/company fit",
    "- clarity/structure",
    "- tone/authenticity"
  ].join("\n");
}
