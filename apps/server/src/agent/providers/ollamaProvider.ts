import { type AgentStatus, type LlmProvider, LlmProviderError } from "../types.js";

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements LlmProvider {
  readonly providerId = "ollama" as const;
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OllamaProviderOptions) {
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async checkHealth(): Promise<AgentStatus> {
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(this.options.timeoutMs, 10_000)),
      });
      if (!res.ok) {
        return {
          provider: "ollama",
          ready: false,
          model: this.model,
          message: `Ollama に接続できません (HTTP ${res.status})`,
        };
      }
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      const names = body.models?.map((m) => m.name) ?? [];
      const hasModel =
        names.some((n) => n === this.model || n.startsWith(`${this.model}:`)) ||
        names.some((n) => n.split(":")[0] === this.model.split(":")[0]);
      return {
        provider: "ollama",
        ready: true,
        model: this.model,
        message: hasModel
          ? `Ollama (${this.model})`
          : `Ollama 接続 OK（モデル ${this.model} は未検出。ollama pull を確認）`,
      };
    } catch (e) {
      return {
        provider: "ollama",
        ready: false,
        model: this.model,
        message:
          e instanceof Error ? `Ollama に接続できません: ${e.message}` : "Ollama に接続できません",
      };
    }
  }

  async complete(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new LlmProviderError(
          `Ollama API エラー (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content?.trim();
      if (!content) {
        throw new LlmProviderError("Ollama の応答が空です");
      }
      return content;
    } catch (e) {
      if (e instanceof LlmProviderError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new LlmProviderError(`Ollama がタイムアウトしました (${this.options.timeoutMs}ms)`);
      }
      throw new LlmProviderError(
        e instanceof Error ? e.message : "Ollama の呼び出しに失敗しました",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
