import { ProviderId } from "./types";

export const notionMcpUrl = "https://mcp.notion.com/mcp";
const notionConfigName = "notion";

export interface NotionMcpCheckResult {
  configured: boolean;
  connected?: boolean;
  message: string;
  configName?: string;
}

export interface NotionConnectPlan {
  message: string;
  commandLine?: string;
}

export function parseCodexNotionStatus(stdout: string): NotionMcpCheckResult {
  try {
    const parsed = JSON.parse(stdout) as Array<{ name?: string; transport?: { url?: string } }>;
    const match = parsed.find((server) => isMatchingNotionServer(server.name, server.transport?.url));
    if (!match) {
      return { configured: false, connected: false, message: "Notion MCP is not configured for Codex." };
    }

    return {
      configured: true,
      connected: true,
      configName: match.name ?? notionConfigName,
      message: `Notion MCP is configured for Codex as '${match.name ?? notionConfigName}'.`
    };
  } catch {
    const configured = /notion/i.test(stdout) && stdout.includes(notionMcpUrl);
    return {
      configured,
      connected: configured ? true : false,
      message: configured
        ? "Notion MCP is configured for Codex."
        : "Notion MCP is not configured for Codex."
    };
  }
}

export function parseClaudeNotionStatus(output: string): NotionMcpCheckResult {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = lines.find((line) => /notion/i.test(line) && (line.includes(notionMcpUrl) || /connected|configured/i.test(line)));
  if (!match) {
    return { configured: false, connected: false, message: "Notion MCP is not configured for Claude Code." };
  }

  const connected = inferConnectedStatus(match);
  return {
    configured: true,
    connected,
    configName: inferClaudeConfigName(match),
    message: `Notion MCP is available for Claude Code: ${match}`
  };
}

export function parseGeminiNotionStatus(output: string): NotionMcpCheckResult {
  if (/No MCP servers configured\./i.test(output)) {
    return { configured: false, connected: false, message: "Notion MCP is not configured for Gemini." };
  }

  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const match = lines.find((line) => /notion/i.test(line) || line.includes(notionMcpUrl));
  if (!match) {
    return { configured: false, connected: false, message: "Notion MCP is not configured for Gemini." };
  }

  const connected = inferConnectedStatus(match);
  return {
    configured: true,
    connected,
    configName: notionConfigName,
    message: `Notion MCP is configured for Gemini: ${match}`
  };
}

export function buildNotionConnectPlan(
  providerId: ProviderId,
  providerCommand: string,
  currentStatus: NotionMcpCheckResult,
  platform = process.platform
): NotionConnectPlan {
  if (providerId === "codex") {
    const loginTarget = currentStatus.configName ?? notionConfigName;
    if (currentStatus.configured && currentStatus.connected === false) {
      return {
        message: "Opening a terminal to refresh Codex Notion MCP and restart OAuth login.",
        commandLine: `${buildNotionRemoveCommand(providerId, providerCommand, loginTarget, platform)} && ${buildNotionAddCommand(providerId, providerCommand, platform)} && ${buildCodexLoginCommand(providerCommand, loginTarget, platform)}`
      };
    }

    if (currentStatus.configured) {
      return {
        message: "Opening a terminal to complete Codex Notion OAuth login.",
        commandLine: buildCodexLoginCommand(providerCommand, loginTarget, platform)
      };
    }

    return {
      message: "Opening a terminal to add the Notion MCP preset for Codex and start OAuth login.",
      commandLine: `${buildNotionAddCommand(providerId, providerCommand, platform)} && ${buildCodexLoginCommand(providerCommand, notionConfigName, platform)}`
    };
  }

  if (currentStatus.configured && currentStatus.connected === false) {
    return {
      message: `Opening a terminal to refresh the Notion MCP connection for ${providerLabel(providerId)}.`,
      commandLine: `${buildNotionRemoveCommand(providerId, providerCommand, currentStatus.configName ?? notionConfigName, platform)} && ${buildNotionAddCommand(providerId, providerCommand, platform)}`
    };
  }

  if (currentStatus.configured) {
    return {
      message: `${providerLabel(providerId)} already has a Notion MCP connection. If you need to re-authenticate, use the provider's own MCP management flow.`
    };
  }

  return {
    message: `Opening a terminal to add the official Notion MCP preset for ${providerLabel(providerId)}.`,
    commandLine: buildNotionAddCommand(providerId, providerCommand, platform)
  };
}

export function buildNotionDisconnectPlan(
  providerId: ProviderId,
  providerCommand: string,
  currentStatus: NotionMcpCheckResult,
  platform = process.platform
): NotionConnectPlan {
  if (!currentStatus.configured) {
    return {
      message: `Notion MCP is not configured for ${providerLabel(providerId)}.`
    };
  }

  const targetName = currentStatus.configName ?? notionConfigName;
  return {
    message: `Opening a terminal to remove the Notion MCP connection from ${providerLabel(providerId)}.`,
    commandLine: buildNotionRemoveCommand(providerId, providerCommand, targetName, platform)
  };
}

function joinShellCommand(parts: string[], platform: string): string {
  return parts.map((part) => quoteShellArg(part, platform)).join(" ");
}

function quoteShellArg(value: string, platform: string): string {
  if (platform === "win32") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function isMatchingNotionServer(name?: string, url?: string): boolean {
  return (name?.toLowerCase().includes("notion") ?? false) || url === notionMcpUrl;
}

function inferConnectedStatus(line: string): boolean | undefined {
  if (/disconnected|unauthorized|failed|error/i.test(line)) {
    return false;
  }
  if (/connected|available|configured/i.test(line)) {
    return true;
  }
  return undefined;
}

function inferClaudeConfigName(line: string): string {
  const prefix = line.split(":")[0]?.trim();
  return prefix || notionConfigName;
}

function buildCodexLoginCommand(providerCommand: string, targetName: string, platform: string): string {
  return joinShellCommand([providerCommand, "mcp", "login", targetName], platform);
}

function buildNotionAddCommand(providerId: ProviderId, providerCommand: string, platform: string): string {
  switch (providerId) {
    case "codex":
      return joinShellCommand([providerCommand, "mcp", "add", notionConfigName, "--url", notionMcpUrl], platform);
    case "claude":
      return joinShellCommand([providerCommand, "mcp", "add", "--transport", "http", "--scope", "user", notionConfigName, notionMcpUrl], platform);
    case "gemini":
      return joinShellCommand([providerCommand, "mcp", "add", "--transport", "http", "--scope", "user", notionConfigName, notionMcpUrl], platform);
  }
}

function buildNotionRemoveCommand(providerId: ProviderId, providerCommand: string, targetName: string, platform: string): string {
  switch (providerId) {
    case "codex":
      return joinShellCommand([providerCommand, "mcp", "remove", targetName], platform);
    case "claude":
      return joinShellCommand([providerCommand, "mcp", "remove", "--scope", "user", targetName], platform);
    case "gemini":
      return joinShellCommand([providerCommand, "mcp", "remove", targetName], platform);
  }
}

function providerLabel(providerId: ProviderId): string {
  switch (providerId) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude Code";
    case "gemini":
      return "Gemini";
  }
}
