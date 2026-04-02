import * as vscode from "vscode";
import { RunEvent } from "../core/types";
import {
  BannerPayload,
  ContinuationPreset,
  ExtensionToWebviewMessage,
  ExtensionToWebviewMessageSchema,
  ProfileDocumentPreviewPayload,
  ProjectDocumentEditorPreset
} from "../core/webviewProtocol";
import { SidebarState } from "../core/viewModels";
import { buildSidebarHtml } from "./sidebarTemplate";

export class ForJobSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "forjob.sidebar";

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: unknown) => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.webview.html = buildSidebarHtml(webviewView.webview, getNonce());
    webviewView.webview.onDidReceiveMessage((message) => {
      void this.onMessage(message);
    });
  }

  async updateState(state: SidebarState): Promise<void> {
    await this.postMessage({ type: "state", payload: state });
  }

  async postContinuationPreset(payload: ContinuationPreset): Promise<void> {
    await this.postMessage({ type: "continuationPreset", payload });
  }

  async postRunEvent(event: RunEvent): Promise<void> {
    await this.postMessage({ type: "runEvent", payload: event });
  }

  async postBanner(message: string, kind: "info" | "error" = "info"): Promise<void> {
    const payload: BannerPayload = { kind, message };
    await this.postMessage({ type: "banner", payload });
  }

  async postProjectDocumentEditorPreset(payload: ProjectDocumentEditorPreset): Promise<void> {
    await this.postMessage({ type: "projectDocumentEditorPreset", payload });
  }

  async postProfileDocumentPreview(payload: ProfileDocumentPreviewPayload): Promise<void> {
    await this.postMessage({ type: "profileDocumentPreview", payload });
  }

  private async postMessage(message: ExtensionToWebviewMessage): Promise<void> {
    const payload = ExtensionToWebviewMessageSchema.parse(message);
    await this.view?.webview.postMessage(payload);
  }
}

function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 16; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
