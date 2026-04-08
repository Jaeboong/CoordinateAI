import * as vscode from "vscode";
import { ProjectDocumentEditorPreset } from "../../core/webviewProtocol";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";
import { importUploadedFiles, pickAndImportFiles } from "./profileHandlers";

export function createProjectHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "pickProjectFiles"
  | "uploadProjectFiles"
  | "createProject"
  | "updateProjectInfo"
  | "deleteProject"
  | "saveProjectText"
  | "loadProjectDocumentEditor"
  | "updateProjectDocument"
  | "deleteProjectDocument"
  | "saveProjectRubric"
  | "toggleProjectPinned"
  | "openStorageRoot"
> {
  return {
    pickProjectFiles: async (message) => pickAndImportFiles(ctx, "project", message.projectSlug),
    uploadProjectFiles: async (message) => importUploadedFiles(ctx, "project", message.files, message.projectSlug),
    createProject: async (message) => {
      await ctx.runBusy("프로젝트를 만드는 중...", async () => {
        await ctx.storage().createProject(buildProjectInput(message));
        await ctx.stateStore.refreshProjects();
        await ctx.sidebar.postBanner("프로젝트를 만들었습니다.");
      });
    },
    updateProjectInfo: async (message) => {
      await ctx.runBusy("프로젝트 정보를 업데이트하는 중...", async () => {
        await ctx.storage().updateProjectInfo(message.projectSlug, buildProjectInput(message));
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner("프로젝트 정보를 업데이트했습니다.");
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

      await ctx.runBusy("프로젝트를 삭제하는 중...", async () => {
        await ctx.storage().deleteProject(message.projectSlug);
        await ctx.stateStore.refreshProjects();
        await ctx.sidebar.postBanner("프로젝트를 삭제했습니다.");
      });
    },
    saveProjectText: async (message) => {
      await ctx.runBusy("프로젝트 텍스트를 저장하는 중...", async () => {
        await ctx.storage().saveProjectTextDocument(
          message.projectSlug,
          message.title,
          message.content,
          Boolean(message.pinnedByDefault),
          message.note
        );
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner("프로젝트 텍스트를 저장했습니다.");
      });
    },
    loadProjectDocumentEditor: async (message) => {
      await ctx.runBusy("문서를 불러오는 중...", async () => {
        await loadProjectDocumentEditorPreset(ctx, message.projectSlug, message.documentId);
      }, false);
    },
    updateProjectDocument: async (message) => {
      await ctx.runBusy("프로젝트 문서를 업데이트하는 중...", async () => {
        await ctx.storage().updateProjectDocument(message.projectSlug, message.documentId, {
          title: message.title,
          note: message.note,
          pinnedByDefault: message.pinnedByDefault,
          content: message.content
        });
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner("프로젝트 문서를 업데이트했습니다.");
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

      await ctx.runBusy("프로젝트 문서를 삭제하는 중...", async () => {
        await ctx.storage().deleteProjectDocument(message.projectSlug, message.documentId);
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner("프로젝트 문서를 삭제했습니다.");
      });
    },
    saveProjectRubric: async (message) => {
      await ctx.runBusy("평가 기준을 저장하는 중...", async () => {
        await ctx.storage().updateProjectRubric(message.projectSlug, message.rubric);
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner("평가 기준을 저장했습니다.");
      });
    },
    toggleProjectPinned: async (message) => {
      await ctx.runBusy("문서 기본 포함 상태를 업데이트하는 중...", async () => {
        await ctx.storage().setProjectDocumentPinned(message.projectSlug, message.documentId, message.pinned);
        await ctx.stateStore.refreshProjects(message.projectSlug);
      });
    },
    openStorageRoot: async () => {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(ctx.storage().storageRoot));
    }
  };
}

async function loadProjectDocumentEditorPreset(ctx: ControllerContext, projectSlug: string, documentId: string): Promise<void> {
  const document = await ctx.storage().getProjectDocument(projectSlug, documentId);
  const contentEditable = ["text", "txt", "md"].includes(document.sourceType);
  const preset: ProjectDocumentEditorPreset = {
    projectSlug,
    documentId: document.id,
    title: document.title,
    note: document.note || "",
    pinnedByDefault: document.pinnedByDefault,
    sourceType: document.sourceType,
    content: (contentEditable ? await ctx.storage().readDocumentRawContent(document) : "") || "",
    contentEditable
  };
  await ctx.sidebar.postProjectDocumentEditorPreset(preset);
}

export function buildProjectInput(message: {
  companyName: string;
  roleName?: string;
  mainResponsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  keywords?: string[];
  jobPostingUrl?: string;
  jobPostingText?: string;
  essayQuestions?: string[];
  openDartCorpCode?: string;
}): {
  companyName: string;
  roleName?: string;
  mainResponsibilities?: string;
  qualifications?: string;
  preferredQualifications?: string;
  keywords?: string[];
  jobPostingUrl?: string;
  jobPostingText?: string;
  essayQuestions?: string[];
  openDartCorpCode?: string;
} {
  return {
    companyName: message.companyName,
    roleName: message.roleName,
    mainResponsibilities: message.mainResponsibilities,
    qualifications: message.qualifications,
    preferredQualifications: message.preferredQualifications,
    keywords: message.keywords,
    jobPostingUrl: message.jobPostingUrl,
    jobPostingText: message.jobPostingText,
    essayQuestions: message.essayQuestions,
    openDartCorpCode: message.openDartCorpCode
  };
}
