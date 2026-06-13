import { type AgentStatus, type LlmProvider, LlmProviderError } from "../types.js";

export interface OpenAiCompatibleProviderOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** LM Studio 等の OpenAI 互換 API 向けプロバイダ */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly providerId = "openai_compatible" as const;
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleProviderOptions) {
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async checkHealth(): Promise<AgentStatus> {
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}/models`, {
        signal: AbortSignal.timeout(Math.min(this.options.timeoutMs, 10_000)),
      });
      if (!res.ok) {
        return {
          provider: "openai_compatible",
          ready: false,
          model: this.model,
          message: `OpenAI 互換 API に接続できません (HTTP ${res.status})`,
        };
      }
      return {
        provider: "openai_compatible",
        ready: true,
        model: this.model,
        message: `OpenAI 互換 API (${this.model})`,
      };
    } catch (e) {
      return {
        provider: "openai_compatible",
        ready: false,
        model: this.model,
        message:
          e instanceof Error
            ? `OpenAI 互換 API に接続できません: ${e.message}`
            : "OpenAI 互換 API に接続できません",
      };
    }
  }

  async complete(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: "Respond with valid JSON only matching the user request.",
            },
            { role: "user", content: prompt },
          ],
          stream: false,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new LlmProviderError(
          `OpenAI 互換 API エラー (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new LlmProviderError("OpenAI 互換 API の応答が空です");
      }
      return content;
    } catch (e) {
      if (e instanceof LlmProviderError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new LlmProviderError(
          `OpenAI 互換 API がタイムアウトしました (${this.options.timeoutMs}ms)`,
        );
      }
      throw new LlmProviderError(
        e instanceof Error ? e.message : "OpenAI 互換 API の呼び出しに失敗しました",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
