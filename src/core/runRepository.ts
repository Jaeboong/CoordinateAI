import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  RunChatMessage,
  ReviewTurn,
  RunEvent,
  RunRecord
} from "./types";
import { RunChatMessageSchema, ReviewTurnSchema, RunRecordSchema } from "./schemas";
import type { StoragePaths } from "./storagePaths";
import { RunContinuationContext } from "./storage";
import { ensureDir, fileExists, readJsonFile, writeJsonFile } from "./utils";

/**
 * Handles run lifecycle persistence: create, update, list, and read run artifacts.
 */
export class RunRepository {
  constructor(private readonly paths: StoragePaths) {}

  async createRun(record: RunRecord): Promise<string> {
    const runDir = this.paths.runDir(record.projectSlug, record.id);
    await ensureDir(runDir);
    await writeJsonFile(path.join(runDir, "input.json"), record);
    return runDir;
  }

  async updateRun(projectSlug: string, runId: string, updates: Partial<RunRecord>): Promise<RunRecord> {
    const existing = await this.getRun(projectSlug, runId);
    const merged = RunRecordSchema.parse({ ...existing, ...updates });
    await writeJsonFile(path.join(this.paths.runDir(projectSlug, runId), "input.json"), merged);
    return merged;
  }

  async getRun(projectSlug: string, runId: string): Promise<RunRecord> {
    const raw = await readJsonFile(path.join(this.paths.runDir(projectSlug, runId), "input.json"), {});
    return RunRecordSchema.parse(raw);
  }

  async listRuns(projectSlug: string): Promise<RunRecord[]> {
    try {
      const entries = await fs.readdir(this.paths.projectRunsDir(projectSlug), { withFileTypes: true });
      const runs: RunRecord[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const inputPath = path.join(this.paths.projectRunsDir(projectSlug), entry.name, "input.json");
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
    const artifactPath = path.join(this.paths.runDir(projectSlug, runId), fileName);
    await fs.writeFile(artifactPath, content, "utf8");
    return artifactPath;
  }

  async saveProjectInsightJson(projectSlug: string, fileName: string, data: unknown): Promise<string> {
    const artifactPath = path.join(this.paths.projectInsightsDir(projectSlug), fileName);
    await ensureDir(this.paths.projectInsightsDir(projectSlug));
    await writeJsonFile(artifactPath, data);
    return artifactPath;
  }

  async readProjectInsightJson<T>(projectSlug: string, fileName: string): Promise<T | undefined> {
    const artifactPath = path.join(this.paths.projectInsightsDir(projectSlug), fileName);
    if (!(await fileExists(artifactPath))) {
      return undefined;
    }

    return readJsonFile<T>(artifactPath, {} as T);
  }

  async appendRunEvent(projectSlug: string, runId: string, event: RunEvent): Promise<void> {
    const artifactPath = path.join(this.paths.runDir(projectSlug, runId), "events.ndjson");
    await fs.appendFile(artifactPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  async saveReviewTurns(projectSlug: string, runId: string, turns: ReviewTurn[]): Promise<void> {
    ReviewTurnSchema.array().parse(turns);
    await writeJsonFile(path.join(this.paths.runDir(projectSlug, runId), "review-turns.json"), turns);
  }

  async saveRunChatMessages(projectSlug: string, runId: string, messages: RunChatMessage[]): Promise<void> {
    RunChatMessageSchema.array().parse(messages);
    await writeJsonFile(path.join(this.paths.runDir(projectSlug, runId), "chat-messages.json"), messages);
  }

  async readOptionalRunArtifact(projectSlug: string, runId: string, fileName: string): Promise<string | undefined> {
    const artifactPath = path.join(this.paths.runDir(projectSlug, runId), fileName);
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

    return { record, summary, improvementPlan, revisedDraft, notionBrief, chatMessages };
  }

  getRunArtifactPath(projectSlug: string, runId: string, fileName: string): string {
    return path.join(this.paths.runDir(projectSlug, runId), fileName);
  }

}
