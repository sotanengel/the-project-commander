import { execSync } from "node:child_process";
import os from "node:os";

export type GpuKind = "none" | "nvidia" | "rocm";

export interface GpuInfo {
  kind: GpuKind;
  vramBytes: number;
}

/** 7B 量子化モデル向けの VRAM 閾値（未満は RAM ベース選択へフォールバック） */
export const OLLAMA_GPU_VRAM_THRESHOLD_BYTES = 6 * 1024 ** 3;

export type GpuProbe = () => GpuInfo;

function parseNvidiaVramMib(output: string): number {
  const line = output.trim().split("\n")[0]?.trim();
  const mib = Number(line);
  if (!Number.isFinite(mib) || mib <= 0) return 0;
  return mib * 1024 * 1024;
}

function defaultGpuProbe(): GpuInfo {
  if (os.platform() === "darwin") {
    return { kind: "none", vramBytes: 0 };
  }

  try {
    const nameOutput = execSync("nvidia-smi --query-gpu=name --format=csv,noheader", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (!nameOutput.trim()) {
      return { kind: "none", vramBytes: 0 };
    }

    const vramOutput = execSync(
      "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits",
      {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return { kind: "nvidia", vramBytes: parseNvidiaVramMib(vramOutput) };
  } catch {
    return { kind: "none", vramBytes: 0 };
  }
}

export function detectGpu(probe: GpuProbe = defaultGpuProbe): GpuInfo {
  return probe();
}

export function resolveUseGpu(raw: string | undefined, gpu: GpuInfo): boolean {
  const value = (raw ?? "auto").trim().toLowerCase();
  if (value === "on" || value === "true" || value === "1" || value === "yes") return true;
  if (value === "off" || value === "false" || value === "0" || value === "no") return false;
  return gpu.kind === "nvidia";
}

export function gpuVramGiB(vramBytes: number): number | undefined {
  if (vramBytes <= 0) return undefined;
  return Math.floor(vramBytes / 1024 ** 3);
}

export function resolveAccelerator(gpu: GpuInfo, useGpu: boolean): "cuda" | "cpu" | "none" {
  if (!useGpu || gpu.kind !== "nvidia") return gpu.kind === "none" ? "none" : "cpu";
  return "cuda";
}
