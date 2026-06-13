import { existsSync, readFileSync } from "node:fs";

export type LocalAgentMode = "auto" | "ollama" | "openai_compatible" | "off";

export interface LocalAgentEnv {
  mode: LocalAgentMode;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openAiCompatibleUrl?: string;
  openAiCompatibleModel?: string;
  timeoutMs: number;
}

export function resolveLocalAgentMode(raw: string | undefined): LocalAgentMode {
  const value = (raw ?? "auto").trim().toLowerCase();
  if (value === "off" || value === "false" || value === "0") return "off";
  if (value === "ollama") return "ollama";
  if (value === "openai_compatible" || value === "openai") return "openai_compatible";
  return "auto";
}

export function readLocalAgentEnv(): LocalAgentEnv {
  const openAiUrl = process.env.TPC_OPENAI_COMPATIBLE_URL?.trim();
  const openAiModel = process.env.TPC_OPENAI_COMPATIBLE_MODEL?.trim();
  return {
    mode: resolveLocalAgentMode(process.env.TPC_LOCAL_AGENT),
    ollamaBaseUrl: (process.env.TPC_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: process.env.TPC_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    openAiCompatibleUrl: openAiUrl ? openAiUrl.replace(/\/$/, "") : undefined,
    openAiCompatibleModel: openAiModel || undefined,
    timeoutMs: Number(process.env.TPC_LOCAL_AGENT_TIMEOUT_MS ?? 120_000),
  };
}

export function isLikelyContainerEnvironment(): boolean {
  if (process.env.TPC_IN_CONTAINER === "1") return true;
  if (existsSync("/.dockerenv")) return true;
  try {
    if (existsSync("/proc/1/cgroup")) {
      const cgroup = readFileSync("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods/i.test(cgroup)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function resolveOllamaBaseUrl(env: LocalAgentEnv): string {
  if (env.ollamaBaseUrl !== "http://127.0.0.1:11434") {
    return env.ollamaBaseUrl;
  }
  if (isLikelyContainerEnvironment()) {
    return "http://host.docker.internal:11434";
  }
  return env.ollamaBaseUrl;
}
