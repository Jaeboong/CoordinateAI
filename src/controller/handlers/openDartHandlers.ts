import { OpenDartClient } from "../../core/openDart";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";

export const openDartSecretKey = "forjob.apiKey.opendart";

export function createOpenDartHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "saveOpenDartApiKey"
  | "clearOpenDartApiKey"
  | "testOpenDartConnection"
> {
  return {
    saveOpenDartApiKey: async (message) => {
      await ctx.runBusy("OpenDART API 키를 저장하는 중...", async () => {
        await saveOpenDartApiKey(ctx, message.apiKey);
        await ctx.stateStore.refreshOpenDartConfigured();
        ctx.stateStore.setOpenDartConnectionState({
          status: "untested",
          lastError: undefined
        });
        await ctx.sidebar.postBanner("OpenDART API 키를 저장했습니다.");
      });
    },
    clearOpenDartApiKey: async () => {
      await ctx.runBusy("OpenDART API 키를 지우는 중...", async () => {
        await clearOpenDartApiKey(ctx);
        await ctx.stateStore.refreshOpenDartConfigured();
        ctx.stateStore.setOpenDartConnectionState({
          status: "missing",
          lastCheckAt: new Date().toISOString(),
          lastError: "OpenDART API 키가 없습니다."
        });
        await ctx.sidebar.postBanner("OpenDART API 키를 지웠습니다.");
      });
    },
    testOpenDartConnection: async () => {
      await ctx.runBusy("OpenDART 연결을 확인하는 중...", async () => {
        await testOpenDartConnection(ctx);
      });
    }
  };
}

export async function isOpenDartConfigured(ctx: ControllerContext): Promise<boolean> {
  return Boolean(await ctx.context.secrets.get(openDartSecretKey));
}

async function saveOpenDartApiKey(ctx: ControllerContext, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("OpenDART API 키는 비워둘 수 없습니다.");
  }

  await ctx.context.secrets.store(openDartSecretKey, trimmed);
}

async function clearOpenDartApiKey(ctx: ControllerContext): Promise<void> {
  await ctx.context.secrets.delete(openDartSecretKey);
}

export async function getOpenDartApiKey(ctx: ControllerContext): Promise<string | undefined> {
  return ctx.context.secrets.get(openDartSecretKey);
}

async function testOpenDartConnection(ctx: ControllerContext): Promise<void> {
  const apiKey = await getOpenDartApiKey(ctx);
  if (!apiKey) {
    ctx.stateStore.setOpenDartConnectionState({
      status: "missing",
      lastCheckAt: new Date().toISOString(),
      lastError: "OpenDART API 키를 먼저 저장하세요."
    });
    await ctx.sidebar.postBanner("OpenDART API 키를 먼저 저장하세요.", "error");
    return;
  }

  const result = await new OpenDartClient(ctx.storage().storageRoot, apiKey).testConnection();
  ctx.stateStore.setOpenDartConnectionState({
    status: result.ok ? "healthy" : "unhealthy",
    lastCheckAt: new Date().toISOString(),
    lastError: result.ok ? undefined : result.message
  });
  await ctx.sidebar.postBanner(result.message, result.ok ? "info" : "error");
}
