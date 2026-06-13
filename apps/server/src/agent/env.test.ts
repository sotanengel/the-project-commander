import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLLAMA_GPU_VRAM_THRESHOLD_BYTES,
  OLLAMA_MODEL_3B,
  OLLAMA_MODEL_7B,
  OLLAMA_RAM_THRESHOLD_BYTES,
  resolveOllamaModel,
  resolveOllamaModelFromRam,
} from "./env.js";

describe("resolveOllamaModelFromRam", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("明示指定を優先する", () => {
    expect(resolveOllamaModelFromRam("custom:model")).toBe("custom:model");
  });

  it("RAM が閾値未満なら 3B", () => {
    vi.spyOn(os, "totalmem").mockReturnValue(OLLAMA_RAM_THRESHOLD_BYTES - 1);
    expect(resolveOllamaModelFromRam(undefined)).toBe(OLLAMA_MODEL_3B);
  });

  it("RAM が閾値以上なら 7B", () => {
    vi.spyOn(os, "totalmem").mockReturnValue(OLLAMA_RAM_THRESHOLD_BYTES);
    expect(resolveOllamaModelFromRam(undefined)).toBe(OLLAMA_MODEL_7B);
  });
});

describe("resolveOllamaModel", () => {
  it("明示指定を優先する", () => {
    expect(resolveOllamaModel("custom:model", { ramBytes: 0, vramBytes: 0 })).toBe("custom:model");
  });

  it("VRAM が閾値以上なら RAM が低くても 7B", () => {
    expect(
      resolveOllamaModel(undefined, {
        ramBytes: OLLAMA_RAM_THRESHOLD_BYTES - 1,
        vramBytes: OLLAMA_GPU_VRAM_THRESHOLD_BYTES,
      }),
    ).toBe(OLLAMA_MODEL_7B);
  });

  it("VRAM 不足時は RAM 閾値で判定", () => {
    expect(
      resolveOllamaModel(undefined, {
        ramBytes: OLLAMA_RAM_THRESHOLD_BYTES - 1,
        vramBytes: OLLAMA_GPU_VRAM_THRESHOLD_BYTES - 1,
      }),
    ).toBe(OLLAMA_MODEL_3B);
    expect(
      resolveOllamaModel(undefined, {
        ramBytes: OLLAMA_RAM_THRESHOLD_BYTES,
        vramBytes: 0,
      }),
    ).toBe(OLLAMA_MODEL_7B);
  });
});
