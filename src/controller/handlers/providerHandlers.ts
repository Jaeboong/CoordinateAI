import * as vscode from "vscode";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";

export function createProviderHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "testProvider"
  | "setAuthMode"
  | "setProviderModel"
  | "setProviderEffort"
  | "saveApiKey"
  | "clearApiKey"
  | "checkNotionMcp"
  | "connectNotionMcp"
  | "disconnectNotionMcp"
> {
  return {
    testProvider: async (message) => {
      await ctx.runBusy("도구 연결을 확인하는 중...", async () => {
        await ctx.registry().testProvider(message.providerId);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("도구 연결 확인이 끝났습니다.");
      });
    },
    setAuthMode: async (message) => {
      await ctx.runBusy("인증 방식을 업데이트하는 중...", async () => {
        await ctx.registry().setAuthMode(message.providerId, message.authMode);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("인증 방식을 업데이트했습니다.");
      });
    },
    setProviderModel: async (message) => {
      await ctx.runBusy("모델을 업데이트하는 중...", async () => {
        await ctx.registry().setModel(message.providerId, message.model);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("모델을 업데이트했습니다.");
      });
    },
    setProviderEffort: async (message) => {
      await ctx.runBusy("추론 강도를 업데이트하는 중...", async () => {
        await ctx.registry().setEffort(message.providerId, message.effort);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("추론 강도를 업데이트했습니다.");
      });
    },
    saveApiKey: async (message) => {
      await ctx.runBusy("API 키를 저장하는 중...", async () => {
        await ctx.registry().saveApiKey(message.providerId, message.apiKey);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("API 키를 저장했습니다.");
      });
    },
    clearApiKey: async (message) => {
      await ctx.runBusy("API 키를 지우는 중...", async () => {
        await ctx.registry().clearApiKey(message.providerId);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner("API 키를 지웠습니다.");
      });
    },
    checkNotionMcp: async (message) => {
      await ctx.runBusy("Notion MCP 상태를 확인하는 중...", async () => {
        const result = await ctx.registry().checkNotionMcp(message.providerId);
        await ctx.stateStore.refreshProvider(message.providerId);
        await ctx.sidebar.postBanner(result.message, result.configured && result.connected !== false ? "info" : "error");
      });
    },
    connectNotionMcp: async (message) => {
      await ctx.runBusy("Notion MCP 설정을 준비하는 중...", async () => {
        const plan = await ctx.registry().buildNotionConnectPlan(message.providerId);
        await ctx.stateStore.refreshProvider(message.providerId);
        if (!plan.commandLine) {
          await ctx.sidebar.postBanner(plan.message);
          return;
        }

        openSetupTerminal(ctx, `ForJob Notion 설정 (${message.providerId})`, plan.commandLine);
        await ctx.sidebar.postBanner(plan.message);
      });
    },
    disconnectNotionMcp: async (message) => {
      await ctx.runBusy("Notion MCP 해제를 준비하는 중...", async () => {
        const plan = await ctx.registry().buildNotionDisconnectPlan(message.providerId);
        await ctx.stateStore.refreshProvider(message.providerId);
        if (!plan.commandLine) {
          await ctx.sidebar.postBanner(plan.message);
          return;
        }

        openSetupTerminal(ctx, `ForJob Notion 해제 (${message.providerId})`, plan.commandLine);
        await ctx.sidebar.postBanner(plan.message);
      });
    }
  };
}

function openSetupTerminal(ctx: ControllerContext, name: string, commandLine: string): void {
  const terminal = vscode.window.createTerminal({ name, cwd: ctx.workspaceRoot });
  terminal.show(true);
  terminal.sendText(commandLine, true);
}
