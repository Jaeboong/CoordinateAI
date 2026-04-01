import { ProviderCapabilities, ProviderId } from "./types";

export const customModelOptionValue = "__custom__";

const defaultModelOption = { value: "", label: "기본값" };
const defaultEffortOption = { value: "", label: "기본값" };

const providerCapabilitiesMap: Record<ProviderId, ProviderCapabilities> = {
  codex: {
    modelOptions: [
      defaultModelOption,
      { value: "codex-mini-latest", label: "codex-mini-latest" },
      { value: "gpt-5.4", label: "gpt-5.4" },
      { value: "gpt-5.4-mini", label: "gpt-5.4-mini" },
      { value: "gpt-5.3-codex", label: "gpt-5.3-codex" },
      { value: customModelOptionValue, label: "직접 입력..." }
    ],
    effortOptions: [
      defaultEffortOption,
      { value: "low", label: "낮음" },
      { value: "medium", label: "중간" },
      { value: "high", label: "높음" },
      { value: "xhigh", label: "매우 높음" }
    ],
    supportsEffort: true
  },
  claude: {
    modelOptions: [
      defaultModelOption,
      { value: "sonnet", label: "sonnet" },
      { value: "opus", label: "opus" },
      { value: customModelOptionValue, label: "직접 입력..." }
    ],
    effortOptions: [
      defaultEffortOption,
      { value: "low", label: "낮음" },
      { value: "medium", label: "중간" },
      { value: "high", label: "높음" },
      { value: "max", label: "최대" }
    ],
    supportsEffort: true
  },
  gemini: {
    modelOptions: [
      defaultModelOption,
      { value: "auto", label: "auto" },
      { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
      { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { value: "gemini-3-flash-preview", label: "gemini-3-flash-preview" },
      { value: customModelOptionValue, label: "직접 입력..." }
    ],
    effortOptions: [],
    supportsEffort: false
  }
};

export function getProviderCapabilities(providerId: ProviderId): ProviderCapabilities {
  return providerCapabilitiesMap[providerId];
}

export function normalizeProviderSettingValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isCustomModelSelection(providerId: ProviderId, configuredModel: string | undefined): boolean {
  const normalizedModel = normalizeProviderSettingValue(configuredModel);
  if (!normalizedModel) {
    return false;
  }

  return !getProviderCapabilities(providerId).modelOptions.some((option) => option.value === normalizedModel);
}

export function buildProviderArgs(
  providerId: ProviderId,
  prompt: string,
  _testOnly: boolean,
  settings: { model?: string; effort?: string }
): string[] {
  const model = normalizeProviderSettingValue(settings.model);
  const effort = normalizeProviderSettingValue(settings.effort);

  switch (providerId) {
    case "codex": {
      const args = ["exec", "--skip-git-repo-check", "--json"];
      if (model) {
        args.push("-m", model);
      }
      if (effort) {
        args.push("-c", `model_reasoning_effort=${JSON.stringify(effort)}`);
      }
      args.push(prompt);
      return args;
    }
    case "claude": {
      const args: string[] = [];
      if (model) {
        args.push("--model", model);
      }
      if (effort) {
        args.push("--effort", effort);
      }
      args.push("-p", prompt);
      return args;
    }
    case "gemini": {
      const args: string[] = [];
      if (model) {
        args.push("-m", model);
      }
      args.push("-p", prompt, "--output-format", "json");
      return args;
    }
    default:
      return [prompt];
  }
}
