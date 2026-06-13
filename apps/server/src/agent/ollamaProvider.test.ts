import { describe, expect, it, vi } from "vitest";
import { resolveLocalAgentMode } from "./env.js";
import { OllamaProvider } from "./providers/ollamaProvider.js";

describe("resolveLocalAgentMode", () => {
  it("auto がデフォルト", () => {
    expect(resolveLocalAgentMode(undefined)).toBe("auto");
  });

  it("off を解決する", () => {
    expect(resolveLocalAgentMode("off")).toBe("off");
    expect(resolveLocalAgentMode("false")).toBe("off");
  });

  it("ollama を解決する", () => {
    expect(resolveLocalAgentMode("ollama")).toBe("ollama");
  });
});

describe("OllamaProvider", () => {
  it("checkHealth が ready を返す", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: "qwen2.5:7b-instruct" }] }),
    })) as unknown as typeof fetch;

    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:7b-instruct",
      timeoutMs: 5000,
      fetchImpl,
    });
    const status = await provider.checkHealth();
    expect(status.ready).toBe(true);
    expect(status.provider).toBe("ollama");
  });

  it("complete が応答テキストを返す", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/api/chat")) {
        return {
          ok: true,
          json: async () => ({ message: { content: '{"suggestions":[]}' } }),
        };
      }
      return { ok: true, json: async () => ({ models: [] }) };
    }) as unknown as typeof fetch;

    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:7b-instruct",
      timeoutMs: 5000,
      fetchImpl,
    });
    const text = await provider.complete("test prompt");
    expect(text).toBe('{"suggestions":[]}');
  });
});
