import * as vscode from "vscode";
import { ProfileDocumentPreviewPayload, UploadedFile } from "../../core/webviewProtocol";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";

export function createProfileHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "pickProfileFiles"
  | "uploadProfileFiles"
  | "saveProfileText"
  | "toggleProfilePinned"
  | "openProfileDocumentPreview"
> {
  return {
    pickProfileFiles: async () => pickAndImportFiles(ctx, "profile"),
    uploadProfileFiles: async (message) => importUploadedFiles(ctx, "profile", message.files),
    saveProfileText: async (message) => {
      await ctx.runBusy("프로필 텍스트를 저장하는 중...", async () => {
        await ctx.storage().saveProfileTextDocument(
          message.title,
          message.content,
          Boolean(message.pinnedByDefault),
          message.note
        );
        await ctx.stateStore.refreshProfileDocuments();
        await ctx.sidebar.postBanner("프로필 텍스트를 저장했습니다.");
      });
    },
    toggleProfilePinned: async (message) => {
      await ctx.runBusy("문서 기본 포함 상태를 업데이트하는 중...", async () => {
        await ctx.storage().setProfileDocumentPinned(message.documentId, message.pinned);
        await ctx.stateStore.refreshProfileDocuments();
      });
    },
    openProfileDocumentPreview: async (message) => {
      await ctx.runBusy("문서를 불러오는 중...", async () => {
        await loadProfileDocumentPreview(ctx, message.documentId);
      });
    }
  };
}

export async function pickAndImportFiles(ctx: ControllerContext, scope: "profile" | "project", projectSlug?: string): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: "컨텍스트 파일 가져오기"
  });
  if (!selected || selected.length === 0) {
    return;
  }

  await ctx.runBusy("파일을 가져오는 중...", async () => {
    for (const uri of selected) {
      if (scope === "profile") {
        await ctx.storage().importProfileFile(uri.fsPath);
      } else {
        await ctx.storage().importProjectFile(projectSlug || "", uri.fsPath);
      }
    }

    if (scope === "profile") {
      await ctx.stateStore.refreshProfileDocuments();
    } else {
      await ctx.stateStore.refreshProjects(projectSlug);
    }

    await ctx.sidebar.postBanner(`${selected.length}개 파일을 가져왔습니다.`);
  });
}

export async function importUploadedFiles(
  ctx: ControllerContext,
  scope: "profile" | "project",
  files: UploadedFile[],
  projectSlug?: string
): Promise<void> {
  if (files.length === 0) {
    return;
  }

  await ctx.runBusy("파일을 가져오는 중...", async () => {
    for (const file of files) {
      const bytes = Buffer.from(file.contentBase64, "base64");
      if (scope === "profile") {
        await ctx.storage().importProfileUpload(file.fileName, bytes);
      } else {
        await ctx.storage().importProjectUpload(projectSlug || "", file.fileName, bytes);
      }
    }

    if (scope === "profile") {
      await ctx.stateStore.refreshProfileDocuments();
    } else {
      await ctx.stateStore.refreshProjects(projectSlug);
    }

    await ctx.sidebar.postBanner(`${files.length}개 파일을 가져왔습니다.`);
  });
}

async function loadProfileDocumentPreview(ctx: ControllerContext, documentId: string): Promise<void> {
  const document = await ctx.storage().getProfileDocument(documentId);
  const preview = await ctx.storage().readDocumentPreviewContent(document);
  const payload: ProfileDocumentPreviewPayload = {
    documentId: document.id,
    title: document.title,
    note: document.note || "",
    sourceType: document.sourceType,
    extractionStatus: document.extractionStatus,
    rawPath: document.rawPath,
    normalizedPath: document.normalizedPath || "",
    previewSource: preview.previewSource,
    content: preview.content
  };
  await ctx.sidebar.postProfileDocumentPreview(payload);
}
