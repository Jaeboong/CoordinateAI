import * as vscode from "vscode";
import { ZodError } from "zod";
import { ContextCompiler } from "../core/contextCompiler";
import { ReviewOrchestrator } from "../core/orchestrator";
import { ProviderRegistry } from "../core/providers";
import { ForJobStorage } from "../core/storage";
import {
  ContinuationPreset,
  ProjectDocumentEditorPreset,
  UploadedFile,
  WebviewToExtensionMessage,
  WebviewToExtensionMessageSchema
} from "../core/webviewProtocol";
import { ForJobSidebarProvider } from "../webview/sidebar";
import { RunSessionManager } from "./runSessionManager";
import { SidebarStateStore } from "./sidebarStateStore";

type MessageHandler<T extends WebviewToExtensionMessage["type"]> = (
  message: Extract<WebviewToExtensionMessage, { type: T }>
) => Promise<void>;

type MessageHandlerMap = {
  [K in WebviewToExtensionMessage["type"]]: MessageHandler<K>;
};

export class ForJobController {
  private readonly workspaceRoot: string | undefined;
  private readonly storage: ForJobStorage | undefined;
  private readonly registry: ProviderRegistry | undefined;
  private readonly compiler: ContextCompiler | undefined;
  private readonly orchestrator: ReviewOrchestrator | undefined;
  private readonly sidebar: ForJobSidebarProvider;
  private readonly stateStore: SidebarStateStore;
  private readonly runSessions = new RunSessionManager();

  private readonly handlers: MessageHandlerMap = {
    ready: async () => this.pushState(),
    refresh: async () => {
      await this.refreshAll(true);
      await this.pushState();
    },
    testProvider: async (message) => {
      await this.runBusy("도구 연결을 확인하는 중...", async () => {
        await this.requireRegistry().testProvider(message.providerId);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("도구 연결 확인이 끝났습니다.");
      });
    },
    setAuthMode: async (message) => {
      await this.runBusy("인증 방식을 업데이트하는 중...", async () => {
        await this.requireRegistry().setAuthMode(message.providerId, message.authMode);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("인증 방식을 업데이트했습니다.");
      });
    },
    setProviderModel: async (message) => {
      await this.runBusy("모델을 업데이트하는 중...", async () => {
        await this.requireRegistry().setModel(message.providerId, message.model);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("모델을 업데이트했습니다.");
      });
    },
    setProviderEffort: async (message) => {
      await this.runBusy("추론 강도를 업데이트하는 중...", async () => {
        await this.requireRegistry().setEffort(message.providerId, message.effort);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("추론 강도를 업데이트했습니다.");
      });
    },
    saveApiKey: async (message) => {
      await this.runBusy("API 키를 저장하는 중...", async () => {
        await this.requireRegistry().saveApiKey(message.providerId, message.apiKey);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("API 키를 저장했습니다.");
      });
    },
    clearApiKey: async (message) => {
      await this.runBusy("API 키를 지우는 중...", async () => {
        await this.requireRegistry().clearApiKey(message.providerId);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner("API 키를 지웠습니다.");
      });
    },
    checkNotionMcp: async (message) => {
      await this.runBusy("Notion MCP 상태를 확인하는 중...", async () => {
        const result = await this.requireRegistry().checkNotionMcp(message.providerId);
        await this.stateStore.refreshProvider(message.providerId);
        await this.sidebar.postBanner(result.message, result.configured && result.connected !== false ? "info" : "error");
      });
    },
    connectNotionMcp: async (message) => {
      await this.runBusy("Notion MCP 설정을 준비하는 중...", async () => {
        const plan = await this.requireRegistry().buildNotionConnectPlan(message.providerId);
        await this.stateStore.refreshProvider(message.providerId);
        if (!plan.commandLine) {
          await this.sidebar.postBanner(plan.message);
          return;
        }

        this.openSetupTerminal(`ForJob Notion 설정 (${message.providerId})`, plan.commandLine);
        await this.sidebar.postBanner(plan.message);
      });
    },
    disconnectNotionMcp: async (message) => {
      await this.runBusy("Notion MCP 해제를 준비하는 중...", async () => {
        const plan = await this.requireRegistry().buildNotionDisconnectPlan(message.providerId);
        await this.stateStore.refreshProvider(message.providerId);
        if (!plan.commandLine) {
          await this.sidebar.postBanner(plan.message);
          return;
        }

        this.openSetupTerminal(`ForJob Notion 해제 (${message.providerId})`, plan.commandLine);
        await this.sidebar.postBanner(plan.message);
      });
    },
    pickProfileFiles: async () => this.pickAndImportFiles("profile"),
    pickProjectFiles: async (message) => this.pickAndImportFiles("project", message.projectSlug),
    uploadProfileFiles: async (message) => this.importUploadedFiles("profile", message.files),
    uploadProjectFiles: async (message) => this.importUploadedFiles("project", message.files, message.projectSlug),
    saveProfileText: async (message) => {
      await this.runBusy("프로필 텍스트를 저장하는 중...", async () => {
        await this.requireStorage().saveProfileTextDocument(
          message.title,
          message.content,
          Boolean(message.pinnedByDefault),
          message.note
        );
        await this.stateStore.refreshProfileDocuments();
        await this.sidebar.postBanner("프로필 텍스트를 저장했습니다.");
      });
    },
    createProject: async (message) => {
      await this.runBusy("프로젝트를 만드는 중...", async () => {
        await this.requireStorage().createProject(
          message.companyName,
          message.roleName,
          message.mainResponsibilities,
          message.qualifications
        );
        await this.stateStore.refreshProjects();
        await this.sidebar.postBanner("프로젝트를 만들었습니다.");
      });
    },
    updateProjectInfo: async (message) => {
      await this.runBusy("프로젝트 정보를 업데이트하는 중...", async () => {
        await this.requireStorage().updateProjectInfo(
          message.projectSlug,
          message.companyName,
          message.roleName,
          message.mainResponsibilities,
          message.qualifications
        );
        await this.stateStore.refreshProjects(message.projectSlug);
        await this.sidebar.postBanner("프로젝트 정보를 업데이트했습니다.");
      });
    },
    deleteProject: async (message) => {
      const confirmed = await vscode.window.showWarningMessage(
        `"${message.projectSlug}" 프로젝트와 그 아래 저장된 모든 실행 결과를 삭제할까요?`,
        { modal: true },
        "삭제"
      );
      if (confirmed !== "삭제") {
        return;
      }

      await this.runBusy("프로젝트를 삭제하는 중...", async () => {
        await this.requireStorage().deleteProject(message.projectSlug);
        await this.stateStore.refreshProjects();
        await this.sidebar.postBanner("프로젝트를 삭제했습니다.");
      });
    },
    saveProjectText: async (message) => {
      await this.runBusy("프로젝트 텍스트를 저장하는 중...", async () => {
        await this.requireStorage().saveProjectTextDocument(
          message.projectSlug,
          message.title,
          message.content,
          Boolean(message.pinnedByDefault),
          message.note
        );
        await this.stateStore.refreshProjects(message.projectSlug);
        await this.sidebar.postBanner("프로젝트 텍스트를 저장했습니다.");
      });
    },
    loadProjectDocumentEditor: async (message) => {
      await this.runBusy("문서를 불러오는 중...", async () => {
        await this.loadProjectDocumentEditorPreset(message.projectSlug, message.documentId);
      }, false);
    },
    updateProjectDocument: async (message) => {
      await this.runBusy("프로젝트 문서를 업데이트하는 중...", async () => {
        await this.requireStorage().updateProjectDocument(message.projectSlug, message.documentId, {
          title: message.title,
          note: message.note,
          pinnedByDefault: message.pinnedByDefault,
          content: message.content
        });
        await this.stateStore.refreshProjects(message.projectSlug);
        await this.sidebar.postBanner("프로젝트 문서를 업데이트했습니다.");
      });
    },
    deleteProjectDocument: async (message) => {
      const confirmed = await vscode.window.showWarningMessage(
        "선택한 프로젝트에서 이 문서를 삭제할까요?",
        { modal: true },
        "삭제"
      );
      if (confirmed !== "삭제") {
        return;
      }

      await this.runBusy("프로젝트 문서를 삭제하는 중...", async () => {
        await this.requireStorage().deleteProjectDocument(message.projectSlug, message.documentId);
        await this.stateStore.refreshProjects(message.projectSlug);
        await this.sidebar.postBanner("프로젝트 문서를 삭제했습니다.");
      });
    },
    saveProjectRubric: async (message) => {
      await this.runBusy("평가 기준을 저장하는 중...", async () => {
        await this.requireStorage().updateProjectRubric(message.projectSlug, message.rubric);
        await this.stateStore.refreshProjects(message.projectSlug);
        await this.sidebar.postBanner("평가 기준을 저장했습니다.");
      });
    },
    toggleProfilePinned: async (message) => {
      await this.runBusy("문서 기본 포함 상태를 업데이트하는 중...", async () => {
        await this.requireStorage().setProfileDocumentPinned(message.documentId, message.pinned);
        await this.stateStore.refreshProfileDocuments();
      });
    },
    toggleProjectPinned: async (message) => {
      await this.runBusy("문서 기본 포함 상태를 업데이트하는 중...", async () => {
        await this.requireStorage().setProjectDocumentPinned(message.projectSlug, message.documentId, message.pinned);
        await this.stateStore.refreshProjects(message.projectSlug);
      });
    },
    runReview: async (message) => {
      await this.startRun(message);
    },
    submitRoundIntervention: async (message) => {
      const outcome = this.runSessions.submitIntervention(message.message?.trim() || "");
      this.stateStore.setRunState(this.runSessions.snapshot());
      await this.pushState();
      await this.sidebar.postBanner(
        outcome === "queued"
          ? "메시지를 대기열에 넣었습니다. 현재 작성 중인 모델이 끝나면 대화 방향이 바뀝니다."
          : "세션을 계속 진행합니다..."
      );
    },
    openArtifact: async (message) => {
      await this.openArtifact(message.projectSlug, message.runId, message.fileName);
    },
    loadRunContinuation: async (message) => {
      await this.runBusy("이전 실행을 불러오는 중...", async () => {
        await this.loadRunContinuation(message.projectSlug, message.runId);
      });
    },
    continueRunDiscussion: async (message) => {
      await this.startContinuationRun(message.projectSlug, message.runId, message.message);
    },
    openStorageRoot: async () => {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(this.requireStorage().storageRoot));
    }
  };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.storage = this.workspaceRoot
      ? new ForJobStorage(this.workspaceRoot, vscode.workspace.getConfiguration("forjob").get("storageRoot", ".forjob"))
      : undefined;
    this.registry = this.storage ? new ProviderRegistry(this.context, this.storage) : undefined;
    this.compiler = this.storage ? new ContextCompiler(this.storage) : undefined;
    this.orchestrator =
      this.storage && this.compiler && this.registry ? new ReviewOrchestrator(this.storage, this.compiler, this.registry) : undefined;
    this.sidebar = new ForJobSidebarProvider(this.context.extensionUri, (message) => this.handleMessage(message));
    this.stateStore = new SidebarStateStore({
      workspaceRoot: this.workspaceRoot,
      storage: this.storage,
      registry: this.registry
    });
  }

  async activate(): Promise<void> {
    this.context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ForJobSidebarProvider.viewType, this.sidebar),
      vscode.commands.registerCommand("forjob.refresh", async () => {
        await this.refreshAll(true);
        await this.pushState();
      })
    );

    await this.stateStore.initialize();
    await this.pushState();
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
      void vscode.window.showErrorMessage(messageText);
      await this.sidebar.postBanner(messageText, "error");
      await this.pushState();
    }
  }

  private async runBusy(message: string, work: () => Promise<void>, pushAfter = true): Promise<void> {
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

  private async refreshAll(refreshProviders = false): Promise<void> {
    await this.stateStore.refreshAll({ refreshProviders });
    this.stateStore.setRunState(this.runSessions.snapshot());
  }

  private async pickAndImportFiles(scope: "profile" | "project", projectSlug?: string): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "컨텍스트 파일 가져오기"
    });
    if (!selected || selected.length === 0) {
      return;
    }

    await this.runBusy("파일을 가져오는 중...", async () => {
      for (const uri of selected) {
        if (scope === "profile") {
          await this.requireStorage().importProfileFile(uri.fsPath);
        } else {
          await this.requireStorage().importProjectFile(projectSlug || "", uri.fsPath);
        }
      }

      if (scope === "profile") {
        await this.stateStore.refreshProfileDocuments();
      } else {
        await this.stateStore.refreshProjects(projectSlug);
      }

      await this.sidebar.postBanner(`${selected.length}개 파일을 가져왔습니다.`);
    });
  }

  private async importUploadedFiles(
    scope: "profile" | "project",
    files: UploadedFile[],
    projectSlug?: string
  ): Promise<void> {
    if (files.length === 0) {
      return;
    }

    await this.runBusy("파일을 가져오는 중...", async () => {
      for (const file of files) {
        const bytes = Buffer.from(file.contentBase64, "base64");
        if (scope === "profile") {
          await this.requireStorage().importProfileUpload(file.fileName, bytes);
        } else {
          await this.requireStorage().importProjectUpload(projectSlug || "", file.fileName, bytes);
        }
      }

      if (scope === "profile") {
        await this.stateStore.refreshProfileDocuments();
      } else {
        await this.stateStore.refreshProjects(projectSlug);
      }

      await this.sidebar.postBanner(`${files.length}개 파일을 가져왔습니다.`);
    });
  }

  private async openArtifact(projectSlug: string, runId: string, fileName: string): Promise<void> {
    const filePath = this.requireStorage().getRunArtifactPath(projectSlug, runId, fileName);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private openSetupTerminal(name: string, commandLine: string): void {
    const terminal = vscode.window.createTerminal({ name, cwd: this.workspaceRoot });
    terminal.show(true);
    terminal.sendText(commandLine, true);
  }

  private async startRun(message: Extract<WebviewToExtensionMessage, { type: "runReview" }>): Promise<void> {
    this.runSessions.start(message.projectSlug, message.reviewMode);
    this.stateStore.setRunState(this.runSessions.snapshot());
    await this.pushState();

    try {
      await this.requireOrchestrator().run(
        {
          projectSlug: message.projectSlug,
          question: message.question,
          draft: message.draft,
          reviewMode: message.reviewMode,
          notionRequest: message.notionRequest,
          continuationFromRunId: message.continuationFromRunId,
          continuationNote: message.continuationNote,
          coordinatorProvider: message.coordinatorProvider,
          reviewerProviders: message.reviewerProviders,
          rounds: message.rounds,
          selectedDocumentIds: message.selectedDocumentIds
        },
        async (event) => {
          await this.sidebar.postRunEvent(event);
        },
        async (request) => {
          const pending = this.runSessions.waitForIntervention(request);
          this.stateStore.setRunState(this.runSessions.snapshot());
          await this.pushState();
          return pending;
        },
        () => this.runSessions.drainQueuedMessages()
      );
      await this.sidebar.postBanner("세션이 완료되었습니다.");
    } finally {
      this.runSessions.finish();
      this.stateStore.setRunState(this.runSessions.snapshot());
      await this.stateStore.refreshProjects(message.projectSlug);
      await this.stateStore.refreshPreferences();
      await this.pushState();
    }
  }

  private async loadProjectDocumentEditorPreset(projectSlug: string, documentId: string): Promise<void> {
    const document = await this.requireStorage().getProjectDocument(projectSlug, documentId);
    const contentEditable = ["text", "txt", "md"].includes(document.sourceType);
    const preset: ProjectDocumentEditorPreset = {
      projectSlug,
      documentId: document.id,
      title: document.title,
      note: document.note || "",
      pinnedByDefault: document.pinnedByDefault,
      sourceType: document.sourceType,
      content: (contentEditable ? await this.requireStorage().readDocumentRawContent(document) : "") || "",
      contentEditable
    };
    await this.sidebar.postProjectDocumentEditorPreset(preset);
  }

  private async loadRunContinuation(projectSlug: string, runId: string): Promise<void> {
    const continuation = await this.requireStorage().loadRunContinuationContext(projectSlug, runId);
    const preset: ContinuationPreset = {
      projectSlug,
      runId: continuation.record.id,
      question: continuation.record.question,
      draft: continuation.revisedDraft?.trim() || continuation.record.draft,
      reviewMode: continuation.record.reviewMode,
      notionRequest: "",
      coordinatorProvider: continuation.record.coordinatorProvider,
      reviewerProviders: continuation.record.reviewerProviders,
      selectedDocumentIds: continuation.record.selectedDocumentIds
    };

    await this.sidebar.postContinuationPreset(preset);
    await this.sidebar.postBanner(`${runId} 실행을 이어받아 불러왔습니다.`);
  }

  private async startContinuationRun(projectSlug: string, runId: string, continuationNote?: string): Promise<void> {
    const continuation = await this.requireStorage().loadRunContinuationContext(projectSlug, runId);

    await this.startRun({
      type: "runReview",
      projectSlug,
      question: continuation.record.question,
      draft: continuation.revisedDraft?.trim() || continuation.record.draft,
      reviewMode: continuation.record.reviewMode,
      notionRequest: "",
      continuationFromRunId: continuation.record.id,
      continuationNote: continuationNote?.trim() || "",
      coordinatorProvider: continuation.record.coordinatorProvider,
      reviewerProviders: continuation.record.reviewerProviders,
      rounds: 1,
      selectedDocumentIds: continuation.record.selectedDocumentIds
    });
  }

  private async pushState(): Promise<void> {
    this.stateStore.setRunState(this.runSessions.snapshot());
    await this.sidebar.updateState(this.stateStore.snapshot());
  }

  private requireStorage(): ForJobStorage {
    if (!this.storage) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this.storage;
  }

  private requireRegistry(): ProviderRegistry {
    if (!this.registry) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this.registry;
  }

  private requireOrchestrator(): ReviewOrchestrator {
    if (!this.orchestrator) {
      throw new Error("ForJob를 사용하려면 워크스페이스 폴더를 열어주세요.");
    }

    return this.orchestrator;
  }
}
