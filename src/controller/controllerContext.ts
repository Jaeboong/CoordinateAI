import * as vscode from "vscode";
import { ForJobStorage } from "../core/storage";
import { ProviderRegistry } from "../core/providers";
import { ReviewOrchestrator } from "../core/orchestrator";
import { ForJobInsightWorkspace } from "../webview/insightWorkspace";
import { ForJobSidebarProvider } from "../webview/sidebar";
import { WebviewToExtensionMessage } from "../core/webviewProtocol";
import { RunSessionManager } from "./runSessionManager";
import { SidebarStateStore } from "./sidebarStateStore";

export type MessageHandler<T extends WebviewToExtensionMessage["type"]> = (
  message: Extract<WebviewToExtensionMessage, { type: T }>
) => Promise<void>;

export type MessageHandlerMap = {
  [K in WebviewToExtensionMessage["type"]]: MessageHandler<K>;
};

/**
 * Shared context passed to all handler groups.
 * Provides access to core services without coupling each handler
 * module directly to ForJobController's internal implementation.
 */
export interface ControllerContext {
  readonly context: vscode.ExtensionContext;
  readonly sidebar: ForJobSidebarProvider;
  readonly stateStore: SidebarStateStore;
  readonly runSessions: RunSessionManager;
  readonly insightWorkspace: ForJobInsightWorkspace;
  readonly workspaceRoot: string | undefined;

  /** Throws if no workspace folder is open. */
  storage(): ForJobStorage;

  /** Throws if no workspace folder is open. */
  registry(): ProviderRegistry;

  /** Throws if no workspace folder is open. */
  orchestrator(): ReviewOrchestrator;

  runBusy(message: string, work: () => Promise<void>, pushAfter?: boolean): Promise<void>;
  pushState(): Promise<void>;
  refreshAll(refreshProviders?: boolean): Promise<void>;
  logInfo(message: string, details?: unknown): void;
  logError(message: string, details?: unknown): void;
}
