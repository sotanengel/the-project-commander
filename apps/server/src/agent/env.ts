import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { OLLAMA_GPU_VRAM_THRESHOLD_BYTES, detectGpu, gpuVramGiB, resolveUseGpu } from "./gpu.js";

export type LocalAgentMode = "auto" | "ollama" | "openai_compatible" | "off";

export const OLLAMA_MODEL_7B = "qwen2.5:7b-instruct";
export const OLLAMA_MODEL_3B = "qwen2.5:3b-instruct";
/** 7B 推論 + Docker + OS 用の閾値（未満は 3B へフォールバック） */
export const OLLAMA_RAM_THRESHOLD_BYTES = 12 * 1024 ** 3;
export { OLLAMA_GPU_VRAM_THRESHOLD_BYTES };

export interface LocalAgentEnv {
  mode: LocalAgentMode;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openAiCompatibleUrl?: string;
  openAiCompatibleModel?: string;
  timeoutMs: number;
  useGpu: boolean;
  gpuVramBytes: number;
}

export function resolveLocalAgentMode(raw: string | undefined): LocalAgentMode {
  const value = (raw ?? "auto").trim().toLowerCase();
  if (value === "off" || value === "false" || value === "0") return "off";
  if (value === "ollama") return "ollama";
  if (value === "openai_compatible" || value === "openai") return "openai_compatible";
  return "auto";
}

export interface ResolveOllamaModelInput {
  ramBytes: number;
  vramBytes: number;
  vramThresholdBytes?: number;
  ramThresholdBytes?: number;
}

/** 明示指定が無い場合、VRAM → RAM の順で 7B / 3B を自動選択 */
export function resolveOllamaModel(
  explicit: string | undefined,
  input: ResolveOllamaModelInput = {
    ramBytes: os.totalmem(),
    vramBytes: detectGpu().vramBytes,
  },
): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;

  const vramThreshold = input.vramThresholdBytes ?? OLLAMA_GPU_VRAM_THRESHOLD_BYTES;
  const ramThreshold = input.ramThresholdBytes ?? OLLAMA_RAM_THRESHOLD_BYTES;

  if (input.vramBytes >= vramThreshold) return OLLAMA_MODEL_7B;
  if (input.ramBytes >= ramThreshold) return OLLAMA_MODEL_7B;
  return OLLAMA_MODEL_3B;
}

/** @deprecated resolveOllamaModel を使用 */
export function resolveOllamaModelFromRam(explicit: string | undefined): string {
  return resolveOllamaModel(explicit, { ramBytes: os.totalmem(), vramBytes: 0 });
}

function resolveGpuVramThresholdBytes(): number {
  const raw = process.env.TPC_OLLAMA_GPU_VRAM_THRESHOLD_GIB?.trim();
  if (!raw) return OLLAMA_GPU_VRAM_THRESHOLD_BYTES;
  const gib = Number(raw);
  if (!Number.isFinite(gib) || gib <= 0) return OLLAMA_GPU_VRAM_THRESHOLD_BYTES;
  return gib * 1024 ** 3;
}

export function readLocalAgentEnv(): LocalAgentEnv {
  const openAiUrl = process.env.TPC_OPENAI_COMPATIBLE_URL?.trim();
  const openAiModel = process.env.TPC_OPENAI_COMPATIBLE_MODEL?.trim();
  const gpu = detectGpu();
  const useGpu = resolveUseGpu(process.env.TPC_OLLAMA_USE_GPU, gpu);
  return {
    mode: resolveLocalAgentMode(process.env.TPC_LOCAL_AGENT),
    ollamaBaseUrl: (process.env.TPC_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: resolveOllamaModel(process.env.TPC_OLLAMA_MODEL, {
      ramBytes: os.totalmem(),
      vramBytes: useGpu ? gpu.vramBytes : 0,
      vramThresholdBytes: resolveGpuVramThresholdBytes(),
    }),
    openAiCompatibleUrl: openAiUrl ? openAiUrl.replace(/\/$/, "") : undefined,
    openAiCompatibleModel: openAiModel || undefined,
    timeoutMs: Number(process.env.TPC_LOCAL_AGENT_TIMEOUT_MS ?? 600_000),
    useGpu,
    gpuVramBytes: gpu.vramBytes,
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

export { gpuVramGiB };
