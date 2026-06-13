import { afterEach, describe, expect, it, vi } from "vitest";
import { type GpuProbe, OLLAMA_GPU_VRAM_THRESHOLD_BYTES, detectGpu, resolveUseGpu } from "./gpu.js";

describe("resolveUseGpu", () => {
  it("on を有効とする", () => {
    expect(resolveUseGpu("on", { kind: "none", vramBytes: 0 })).toBe(true);
    expect(resolveUseGpu("true", { kind: "none", vramBytes: 0 })).toBe(true);
  });

  it("off を無効とする", () => {
    expect(resolveUseGpu("off", { kind: "nvidia", vramBytes: 8 * 1024 ** 3 })).toBe(false);
    expect(resolveUseGpu("false", { kind: "nvidia", vramBytes: 8 * 1024 ** 3 })).toBe(false);
  });

  it("auto は NVIDIA のみ有効", () => {
    expect(resolveUseGpu("auto", { kind: "nvidia", vramBytes: 8 * 1024 ** 3 })).toBe(true);
    expect(resolveUseGpu("auto", { kind: "none", vramBytes: 0 })).toBe(false);
    expect(resolveUseGpu(undefined, { kind: "rocm", vramBytes: 8 * 1024 ** 3 })).toBe(false);
  });
});

describe("detectGpu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("macOS では none", () => {
    const probe: GpuProbe = () => ({ kind: "none", vramBytes: 0 });
    expect(detectGpu(probe)).toEqual({ kind: "none", vramBytes: 0 });
  });

  it("nvidia-smi 成功時に VRAM を返す", () => {
    const probe: GpuProbe = () => ({ kind: "nvidia", vramBytes: 8 * 1024 ** 3 });
    expect(detectGpu(probe)).toEqual({ kind: "nvidia", vramBytes: 8 * 1024 ** 3 });
  });

  it("probe 失敗時は none", () => {
    const probe: GpuProbe = () => ({ kind: "none", vramBytes: 0 });
    expect(detectGpu(probe)).toEqual({ kind: "none", vramBytes: 0 });
  });
});

describe("OLLAMA_GPU_VRAM_THRESHOLD_BYTES", () => {
  it("デフォルトは 6 GiB", () => {
    expect(OLLAMA_GPU_VRAM_THRESHOLD_BYTES).toBe(6 * 1024 ** 3);
  });
});
