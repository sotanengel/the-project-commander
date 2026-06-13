import type { ClaudeAnalysisSession } from "./claudeCliSession.js";
import { CliJobQueue } from "./cliJobQueue.js";

export interface ClaudeHostClientSessionOptions {
  hostAgentUrl: string;
  mcpPublicUrl: string;
  timeoutMs: number;
  skipPermissions: boolean;
  fetchImpl?: typeof fetch;
}

/** コンテナからホスト上の Claude CLI ランナーへ委譲する */
export class ClaudeHostClientSession implements ClaudeAnalysisSession {
  private readonly queue = new CliJobQueue();
  private started = false;

  constructor(private readonly options: ClaudeHostClientSessionOptions) {}

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  runAnalysis(prompt: string): Promise<string> {
    return this.queue.enqueue(async () => {
      await this.runRemote("/reset");
      return this.runRemote(prompt);
    });
  }

  private async runRemote(prompt: string): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const res = await fetchImpl(`${this.options.hostAgentUrl.replace(/\/$/, "")}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mcpUrl: this.options.mcpPublicUrl,
          timeoutMs: this.options.timeoutMs,
          skipPermissions: this.options.skipPermissions,
        }),
        signal: controller.signal,
      });

      const body = (await res.json()) as { result?: string; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `ホスト Claude エージェントエラー (HTTP ${res.status})`);
      }
      if (typeof body.result !== "string") {
        throw new Error("ホスト Claude エージェントの応答が不正です");
      }
      return body.result;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Claude CLI がタイムアウトしました (${this.options.timeoutMs}ms)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function checkHostAgentHealth(
  hostAgentUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetchImpl(`${hostAgentUrl.replace(/\/$/, "")}/health`);
    const body = (await res.json()) as { ok?: boolean; error?: string; claudeVersion?: string };
    if (!res.ok || !body.ok) {
      return { ok: false, message: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, message: body.claudeVersion ? `Claude ${body.claudeVersion}` : undefined };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "ホスト Claude エージェントに接続できません",
    };
  }
}
