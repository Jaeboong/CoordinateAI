import { spawn } from "node:child_process";
import * as vscode from "vscode";
import {
  buildNotionDisconnectPlan,
  NotionConnectPlan,
  NotionMcpCheckResult,
  buildNotionConnectPlan,
  parseClaudeNotionStatus,
  parseCodexNotionStatus,
  parseGeminiNotionStatus
} from "./notionMcp";
import { buildProviderArgs, getProviderCapabilities, loadProviderCapabilities, normalizeProviderSettingValue } from "./providerOptions";
import { defaultProviderCommands, resolveProviderCommand, withCommandDirectoryInPath } from "./providerCommandResolver";
import { createProviderStreamProcessor, parseProviderFinalText } from "./providerStreaming";
import {
  AuthMode,
  PromptExecutionOptions,
  ProviderAuthStatus,
  ProviderCommandResult,
  providerIds,
  ProviderId,
  ProviderRuntimeState,
  ProviderStatus,
  RunEvent
} from "./types";
import { ProviderStore } from "./storageInterfaces";
import { nowIso } from "./utils";

const providerNames: Record<ProviderId, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini"
};

type SecretStore = Pick<vscode.SecretStorage, "get" | "store" | "delete">;

export class ProviderRegistry {
  private runtimeStateCache = new Map<ProviderId, ProviderRuntimeState>();
  private notionStatusCache = new Map<ProviderId, NotionMcpCheckResult>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: ProviderStore
  ) {}

  async listRuntimeStates(options: { refresh?: boolean } = {}): Promise<ProviderRuntimeState[]> {
    if (!options.refresh && this.runtimeStateCache.size === providerIds.length) {
      return providerIds.map((providerId) => cloneRuntimeState(this.runtimeStateCache.get(providerId)!));
    }

    const savedStatuses = await this.storage.loadProviderStatuses();
    const states = await Promise.all(providerIds.map((providerId) => this.buildRuntimeState(providerId, savedStatuses[providerId])));
    this.runtimeStateCache = new Map(states.map((state) => [state.providerId, state]));
    return states.map(cloneRuntimeState);
  }

  async refreshRuntimeState(providerId: ProviderId): Promise<ProviderRuntimeState> {
    const savedStatuses = await this.storage.loadProviderStatuses();
    const state = await this.buildRuntimeState(providerId, savedStatuses[providerId]);
    this.runtimeStateCache.set(providerId, state);
    return cloneRuntimeState(state);
  }

  async testProvider(providerId: ProviderId): Promise<ProviderRuntimeState> {
    const command = await this.getCommand(providerId);
    const authMode = this.getAuthMode(providerId);
    const installation = await detectInstallation(command);
    const apiKey = await this.getApiKey(providerId);

    let status: ProviderStatus = {
      providerId,
      installed: installation.installed,
      authMode,
      authStatus: "untested",
      version: installation.version,
      lastCheckAt: nowIso(),
      lastError: installation.error
    };
    const capabilities = installation.installed
      ? await loadProviderCapabilities(providerId, command)
      : getProviderCapabilities(providerId);

    if (!installation.installed) {
      status = { ...status, authStatus: "unhealthy", lastError: installation.error ?? "CLI가 설치되어 있지 않습니다." };
      await this.storage.saveProviderStatus(status);
      return {
        ...status,
        command,
        hasApiKey: Boolean(apiKey),
        configuredModel: this.getModel(providerId),
        configuredEffort: this.getEffort(providerId),
        capabilities
      };
    }

    if (authMode === "apiKey" && !apiKey) {
      status = { ...status, authStatus: "missing", lastError: "API 키 방식에서는 API 키가 필요합니다." };
      await this.storage.saveProviderStatus(status);
      return {
        ...status,
        command,
        hasApiKey: false,
        configuredModel: this.getModel(providerId),
        configuredEffort: this.getEffort(providerId),
        capabilities
      };
    }

    try {
      await this.execute(providerId, "Reply with the single word OK.", {
        cwd: this.storage.storageRoot,
        authMode,
        apiKey
      }, true);
      status = { ...status, authStatus: "healthy", lastError: undefined };
    } catch (error) {
      status = {
        ...status,
        authStatus: "unhealthy",
        lastError: error instanceof Error ? error.message : String(error)
      };
    }

    await this.storage.saveProviderStatus(status);
    const nextState: ProviderRuntimeState = {
      ...status,
      command,
      hasApiKey: Boolean(apiKey),
      configuredModel: this.getModel(providerId),
      configuredEffort: this.getEffort(providerId),
      capabilities,
      notionMcpConfigured: this.notionStatusCache.get(providerId)?.configured,
      notionMcpConnected: this.notionStatusCache.get(providerId)?.connected,
      notionMcpMessage: this.notionStatusCache.get(providerId)?.message
    };
    this.runtimeStateCache.set(providerId, nextState);
    return cloneRuntimeState(nextState);
  }

  async execute(
    providerId: ProviderId,
    prompt: string,
    options: PromptExecutionOptions,
    testOnly = false
  ): Promise<ProviderCommandResult> {
    const command = await this.getCommand(providerId);
    const authMode = options.authMode;
    const apiKey = options.apiKey ?? (await this.getApiKey(providerId));

    if (authMode === "apiKey" && !apiKey) {
      throw new Error(`${providerNames[providerId]}는 API 키 방식에서 API 키가 필요합니다.`);
    }

    const args = buildProviderArgs(providerId, prompt, testOnly, {
      model: normalizeProviderSettingValue(options.modelOverride) ?? this.getModel(providerId),
      effort: normalizeProviderSettingValue(options.effortOverride) ?? this.getEffort(providerId)
    });
    const env = buildEnvironment(providerId, authMode, apiKey, command);
    const result = await runProcess(
      command,
      args,
      options.cwd,
      env,
      options.onEvent,
      providerId,
      options.round,
      options.speakerRole,
      options.messageScope,
      options.participantId,
      options.participantLabel
    );
    return {
      ...result,
      text: parseProviderFinalText(providerId, result.stdout)
    };
  }

  async getCommand(providerId: ProviderId): Promise<string> {
    const configuration = vscode.workspace.getConfiguration("forjob");
    const configuredCommand = configuration.get<string>(
      `providers.${providerId}.command`,
      defaultProviderCommands[providerId]
    );
    return resolveProviderCommand(providerId, configuredCommand);
  }

  getAuthMode(providerId: ProviderId): AuthMode {
    const configuration = vscode.workspace.getConfiguration("forjob");
    return configuration.get<AuthMode>(`providers.${providerId}.authMode`, "cli");
  }

  getModel(providerId: ProviderId): string | undefined {
    const configuration = vscode.workspace.getConfiguration("forjob");
    return normalizeProviderSettingValue(configuration.get<string>(`providers.${providerId}.model`, ""));
  }

  async setModel(providerId: ProviderId, model: string): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("forjob");
    await configuration.update(`providers.${providerId}.model`, model.trim(), vscode.ConfigurationTarget.Workspace);
    this.runtimeStateCache.delete(providerId);
  }

  getEffort(providerId: ProviderId): string | undefined {
    const configuration = vscode.workspace.getConfiguration("forjob");
    return normalizeProviderSettingValue(configuration.get<string>(`providers.${providerId}.effort`, ""));
  }

  async setEffort(providerId: ProviderId, effort: string): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("forjob");
    await configuration.update(`providers.${providerId}.effort`, effort.trim(), vscode.ConfigurationTarget.Workspace);
    this.runtimeStateCache.delete(providerId);
  }

  async setAuthMode(providerId: ProviderId, authMode: AuthMode): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("forjob");
    await configuration.update(`providers.${providerId}.authMode`, authMode, vscode.ConfigurationTarget.Workspace);
    this.runtimeStateCache.delete(providerId);
  }

  async saveApiKey(providerId: ProviderId, apiKey: string): Promise<void> {
    await this.context.secrets.store(secretKey(providerId), apiKey);
    this.runtimeStateCache.delete(providerId);
  }

  async clearApiKey(providerId: ProviderId): Promise<void> {
    await this.context.secrets.delete(secretKey(providerId));
    this.runtimeStateCache.delete(providerId);
  }

  async getApiKey(providerId: ProviderId): Promise<string | undefined> {
    return this.context.secrets.get(secretKey(providerId));
  }

  async checkNotionMcp(providerId: ProviderId): Promise<NotionMcpCheckResult> {
    const command = await this.getCommand(providerId);
    const installation = await detectInstallation(command);
    let result: NotionMcpCheckResult;
    if (!installation.installed) {
      result = {
        configured: false,
        message: `${providerNames[providerId]} CLI가 설치되어 있지 않습니다.`
      };
      this.storeNotionStatus(providerId, result);
      return result;
    }

    const env = withCommandDirectoryInPath(process.env, command);
    try {
      switch (providerId) {
        case "codex": {
          const processResult = await runProcess(command, ["mcp", "list", "--json"], this.storage.storageRoot, env);
          result = parseCodexNotionStatus(processResult.stdout);
          break;
        }
        case "claude": {
          const processResult = await runProcess(command, ["mcp", "list"], this.storage.storageRoot, env);
          result = parseClaudeNotionStatus(`${processResult.stdout}\n${processResult.stderr}`);
          break;
        }
        case "gemini": {
          const processResult = await runProcess(command, ["mcp", "list"], this.storage.storageRoot, env);
          result = parseGeminiNotionStatus(`${processResult.stdout}\n${processResult.stderr}`);
          break;
        }
      }
    } catch (error) {
      result = {
        configured: false,
        message: error instanceof Error ? error.message : String(error)
      };
      this.storeNotionStatus(providerId, result);
      return result;
    }

    this.storeNotionStatus(providerId, result!);
    return result!;
  }

  async buildNotionConnectPlan(providerId: ProviderId): Promise<NotionConnectPlan> {
    const command = await this.getCommand(providerId);
    const status = await this.checkNotionMcp(providerId);
    return buildNotionConnectPlan(providerId, command, status);
  }

  async buildNotionDisconnectPlan(providerId: ProviderId): Promise<NotionConnectPlan> {
    const command = await this.getCommand(providerId);
    const status = await this.checkNotionMcp(providerId);
    return buildNotionDisconnectPlan(providerId, command, status);
  }

  private async buildRuntimeState(providerId: ProviderId, saved?: ProviderStatus): Promise<ProviderRuntimeState> {
    const command = await this.getCommand(providerId);
    const installation = await detectInstallation(command);
    const authMode = this.getAuthMode(providerId);
    const hasApiKey = Boolean(await this.getApiKey(providerId));
    const capabilities = installation.installed
      ? await loadProviderCapabilities(providerId, command)
      : getProviderCapabilities(providerId);

    let authStatus: ProviderAuthStatus = saved?.authStatus ?? "untested";
    let lastError = saved?.lastError;
    const lastCheckAt = saved?.lastCheckAt;

    if (authMode === "apiKey" && !hasApiKey) {
      authStatus = "missing";
      lastError = "API 키 방식에서는 API 키가 필요합니다.";
    }

    const notionStatus = installation.installed ? this.notionStatusCache.get(providerId) : undefined;
    return {
      providerId,
      command,
      authMode,
      hasApiKey,
      configuredModel: this.getModel(providerId),
      configuredEffort: this.getEffort(providerId),
      capabilities,
      installed: installation.installed,
      version: installation.version,
      authStatus,
      lastError: installation.installed ? lastError : installation.error,
      lastCheckAt,
      notionMcpConfigured: notionStatus?.configured,
      notionMcpConnected: notionStatus?.connected,
      notionMcpMessage: notionStatus?.message
    };
  }

  private storeNotionStatus(providerId: ProviderId, status: NotionMcpCheckResult): void {
    this.notionStatusCache.set(providerId, status);
    const cached = this.runtimeStateCache.get(providerId);
    if (!cached) {
      return;
    }

    this.runtimeStateCache.set(providerId, {
      ...cached,
      notionMcpConfigured: status.configured,
      notionMcpConnected: status.connected,
      notionMcpMessage: status.message
    });
  }
}

function secretKey(providerId: ProviderId): string {
  return `forjob.apiKey.${providerId}`;
}

function cloneRuntimeState(state: ProviderRuntimeState): ProviderRuntimeState {
  return {
    ...state,
    capabilities: {
      ...state.capabilities,
      modelOptions: [...state.capabilities.modelOptions],
      effortOptions: [...state.capabilities.effortOptions]
    }
  };
}

function buildEnvironment(
  providerId: ProviderId,
  authMode: AuthMode,
  apiKey: string | undefined,
  command: string
): NodeJS.ProcessEnv {
  const env = withCommandDirectoryInPath(process.env, command);
  if (authMode !== "apiKey" || !apiKey) {
    return env;
  }

  switch (providerId) {
    case "codex":
      env.OPENAI_API_KEY = apiKey;
      env.CODEX_API_KEY = apiKey;
      break;
    case "claude":
      env.ANTHROPIC_API_KEY = apiKey;
      break;
    case "gemini":
      env.GEMINI_API_KEY = apiKey;
      break;
  }

  return env;
}

async function detectInstallation(command: string): Promise<{ installed: boolean; version?: string; error?: string }> {
  try {
    const result = await runProcess(command, ["--version"], process.cwd(), withCommandDirectoryInPath(process.env, command));
    return { installed: true, version: firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr) };
  } catch (error) {
    return {
      installed: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onEvent?: (event: RunEvent) => Promise<void> | void,
  providerId?: ProviderId,
  round?: number,
  speakerRole?: PromptExecutionOptions["speakerRole"],
  messageScope?: string,
  participantId?: string,
  participantLabel?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    let stdout = "";
    let stderr = "";
    const streamProcessor = providerId
      ? createProviderStreamProcessor(providerId, round, speakerRole, messageScope, participantId, participantLabel)
      : undefined;

    // These CLIs are invoked with their full prompt in argv, so we can close
    // stdin immediately and avoid tools like Claude waiting for piped input.
    child.stdin.end();

    child.stdout.on("data", async (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      if (onEvent && providerId) {
        await onEvent({
          timestamp: nowIso(),
          type: "provider-stdout",
          providerId,
          participantId,
          participantLabel,
          round,
          message: text
        });
      }

      if (streamProcessor && onEvent) {
        await streamProcessor.handleStdout(text, onEvent);
      }
    });

    child.stderr.on("data", async (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      if (onEvent && providerId) {
        await onEvent({
          timestamp: nowIso(),
          type: "provider-stderr",
          providerId,
          participantId,
          participantLabel,
          round,
          message: text
        });
      }
    });

    child.on("error", (error) => {
      reject(new Error(`${command}: ${error.message}`));
    });

    child.on("close", (exitCode) => {
      void (async () => {
        if (streamProcessor && onEvent) {
          await streamProcessor.finalize(stdout, onEvent);
        }

        if (exitCode !== 0) {
          reject(new Error(`${command} exited with code ${exitCode}: ${(stderr || stdout).trim()}`));
          return;
        }

        resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
      })().catch((error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}
