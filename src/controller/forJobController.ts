import * as vscode from "vscode";
import { ZodError } from "zod";
import { ContextCompiler } from "../core/contextCompiler";
import { ReviewOrchestrator } from "../core/orchestrator";
import { ProviderRegistry } from "../core/providers";
import { ForJobStorage } from "../core/storage";
import { WebviewToExtensionMessage, WebviewToExtensionMessageSchema } from "../core/webviewProtocol";
import { ForJobInsightWorkspace } from "../webview/insightWorkspace";
import { ForJobSidebarProvider } from "../webview/sidebar";
import { ControllerContext, MessageHandlerMap } from "./controllerContext";
import { createEssayQuestionHandlers } from "./handlers/essayQuestionHandlers";
import { createInsightHandlers } from "./handlers/insightHandlers";
import { isOpenDartConfigured } from "./handlers/openDartHandlers";
import { createOpenDartHandlers } from "./handlers/openDartHandlers";
import { createProfileHandlers } from "./handlers/profileHandlers";
import { createProjectHandlers } from "./handlers/projectHandlers";
import { createProviderHandlers } from "./handlers/providerHandlers";
import { createRunHandlers } from "./handlers/runHandlers";
import { RunSessionManager } from "./runSessionManager";
import { SidebarStateStore } from "./sidebarStateStore";

export class ForJobController implements ControllerContext {
  readonly workspaceRoot: string | undefined;
  private readonly _storage: ForJobStorage | undefined;
  private readonly _registry: ProviderRegistry | undefined;
  private readonly compiler: ContextCompiler | undefined;
  private readonly _orchestrator: ReviewOrchestrator | undefined;
  readonly sidebar: ForJobSidebarProvider;
  readonly insightWorkspace: ForJobInsightWorkspace;
  readonly stateStore: SidebarStateStore;
  readonly runSessions = new RunSessionManager();
  private readonly output = vscode.window.createOutputChannel("ForJob");

  private readonly handlers: MessageHandlerMap;

  constructor(readonly context: vscode.ExtensionContext) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._storage = this.workspaceRoot
      ? new ForJobStorage(this.workspaceRoot, vscode.workspace.getConfiguration("forjob").get("storageRoot", ".forjob"))
      : undefined;
    this._registry = this._storage ? new ProviderRegistry(this.context, this._storage) : undefined;
    this.compiler = this._storage ? new ContextCompiler(this._storage) : undefined;
    this._orchestrator =
      this._storage && this.compiler && this._registry ? new ReviewOrchestrator(this._storage, this.compiler, this._registry) : undefined;
    this.sidebar = new ForJobSidebarProvider(this.context.extensionUri, (message) => this.handleMessage(message));
    this.insightWorkspace = new ForJobInsightWorkspace(this.context.extensionUri, (message) => this.handleMessage(message));
    this.stateStore = new SidebarStateStore({
      workspaceRoot: this.workspaceRoot,
      storage: this._storage,
      registry: this._registry,
      openDartConfigured: () => isOpenDartConfigured(this),
      extensionVersion: String(this.context.extension.packageJSON.version || "0.0.0")
    });

    this.handlers = {
      ready: async () => this.pushState(),
      refresh: async () => {
        await this.refreshAll(true);
        await this.pushState();
      },
      webviewClientError: async (message) => {
        this.logWebviewClientError(message);
      },
      ...createProviderHandlers(this),
      ...createOpenDartHandlers(this),
      ...createProfileHandlers(this),
      ...createProjectHandlers(this),
      ...createEssayQuestionHandlers(this),
      ...createInsightHandlers(this),
      ...createRunHandlers(this)
    };
  }

  async activate(): Promise<void> {
    this.context.subscriptions.push(
      this.output,
      vscode.window.registerWebviewViewProvider(ForJobSidebarProvider.viewType, this.sidebar),
      vscode.commands.registerCommand("forjob.refresh", async () => {
        await this.refreshAll(true);
        await this.pushState();
      })
    );

    await this.stateStore.initialize();
    await this.pushState();
  }

  async pushState(): Promise<void> {
    this.stateStore.setRunState(this.runSessions.snapshot());
    await this.sidebar.updateState(this.stateStore.snapshot());
  }

  async runBusy(message: string, work: () => Promise<void>, pushAfter = true): Promise<void> {
    this.stateStore.setBusyMessage(message);
    await this.pushState();
    try {
      await work();
    } finally {
      this.stateStore.setBusyMessage(undefined);
      if (pushAfter) {
        await this.pushState();
      }
    }
  }

  async refreshAll(refreshProviders = false): Promise<void> {
    await this.stateStore.refreshAll({ refreshProviders });
    this.stateStore.setRunState(this.runSessions.snapshot());
  }

  logInfo(message: string, details?: unknown): void {
    this.writeLog("info", message, details);
  }

  logError(message: string, details?: unknown): void {
    this.writeLog("error", message, details);
  }

  storage(): ForJobStorage {
    if (!this._storage) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this._storage;
  }

  registry(): ProviderRegistry {
    if (!this._registry) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this._registry;
  }

  orchestrator(): ReviewOrchestrator {
    if (!this._orchestrator) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this._orchestrator;
  }

  private async handleMessage(rawMessage: unknown): Promise<void> {
    try {
      const message = WebviewToExtensionMessageSchema.parse(rawMessage);
      await this.handlers[message.type](message as never);
    } catch (error) {
      const messageText = error instanceof ZodError
        ? `웹뷰 메시지가 올바르지 않습니다: ${error.issues.map((issue) => issue.message).join("; ")}`
        : error instanceof Error
          ? error.message
          : String(error);
      this.output.appendLine(`[extension-error] ${messageText}`);
      console.error(`[ForJob extension-error] ${messageText}`);
      void vscode.window.showErrorMessage(messageText);
      await this.sidebar.postBanner(messageText, "error");
      await this.pushState();
    }
  }

  private logWebviewClientError(
    message: Extract<WebviewToExtensionMessage, { type: "webviewClientError" }>
  ): void {
    const details = [
      `[webview:${message.source}] ${message.message}`,
      message.phase ? `phase=${message.phase}` : undefined,
      message.href ? `href=${message.href}` : undefined
    ].filter(Boolean).join(" | ");
    this.output.appendLine(details);
    console.error(`[ForJob webview-error] ${details}`);
    if (message.stack) {
      this.output.appendLine(message.stack);
      console.error(message.stack);
    }
  }

  private writeLog(level: "info" | "error", message: string, details?: unknown): void {
    const prefix = `[${level}] ${message}`;
    this.output.appendLine(prefix);
    if (details !== undefined) {
      this.output.appendLine(this.serializeLogDetails(details));
    }

    const consoleMessage = `[ForJob ${level}] ${message}`;
    if (level === "error") {
      console.error(consoleMessage);
      if (details !== undefined) {
        console.error(details);
      }
      return;
    }

    console.log(consoleMessage);
    if (details !== undefined) {
      console.log(details);
    }
  }

  private serializeLogDetails(details: unknown): string {
    if (typeof details === "string") {
      return details;
    }

    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  }
}
