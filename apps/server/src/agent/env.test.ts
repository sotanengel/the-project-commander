import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLLAMA_MODEL_3B,
  OLLAMA_MODEL_7B,
  OLLAMA_RAM_THRESHOLD_BYTES,
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
