import { spawn } from "node:child_process";
import { COMMENT_SUGGESTION_ALLOWED_MCP_TOOLS } from "@tpc/shared";
import { CliJobQueue } from "./cliJobQueue.js";
import { type McpConfigPaths, createMcpConfigFile } from "./mcpConfig.js";

export interface ClaudePrintResponse {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

export interface ClaudeCliSessionOptions {
  claudeBin: string;
  port: number;
  timeoutMs: number;
  spawnImpl?: typeof spawn;
  mcpConfigFactory?: (port: number) => McpConfigPaths;
}

export class ClaudeCliSession {
  private readonly queue = new CliJobQueue();
  private mcpConfig: McpConfigPaths | null = null;
  private started = false;

  constructor(private readonly options: ClaudeCliSessionOptions) {}

  async start(): Promise<void> {
    if (this.started) return;
    const factory = this.options.mcpConfigFactory ?? createMcpConfigFile;
    this.mcpConfig = factory(this.options.port);
    this.started = true;
  }

  async stop(): Promise<void> {
    this.mcpConfig?.cleanup();
    this.mcpConfig = null;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  getMcpConfigPath(): string | null {
    return this.mcpConfig?.configPath ?? null;
  }

  /** 分析ジョブ: /reset 後にプロンプトを実行する */
  runAnalysis(prompt: string): Promise<string> {
    return this.queue.enqueue(async () => {
      if (!this.mcpConfig) {
        throw new Error("Claude CLI セッションが開始されていません");
      }
      await this.runClaudeCommand("/reset");
      return this.runClaudeCommand(prompt);
    });
  }

  private runClaudeCommand(prompt: string): Promise<string> {
    const mcpConfig = this.mcpConfig;
    if (!mcpConfig) {
      return Promise.reject(new Error("Claude CLI セッションが開始されていません"));
    }

    const spawnImpl = this.options.spawnImpl ?? spawn;
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--mcp-config",
      mcpConfig.configPath,
    ];

    if (prompt !== "/reset") {
      args.push("--allowedTools", COMMENT_SUGGESTION_ALLOWED_MCP_TOOLS.join(","));
    }

    return new Promise((resolve, reject) => {
      const child = spawnImpl(this.options.claudeBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Claude CLI がタイムアウトしました (${this.options.timeoutMs}ms)`));
      }, this.options.timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(
              stderr.trim() || stdout.trim() || `Claude CLI が終了コード ${code} で終了しました`,
            ),
          );
          return;
        }
        try {
          resolve(extractClaudePrintResult(stdout));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }
}

export function extractClaudePrintResult(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Claude CLI の出力が空です");
  }

  let parsed: ClaudePrintResponse;
  try {
    parsed = JSON.parse(trimmed) as ClaudePrintResponse;
  } catch {
    return trimmed;
  }

  if (parsed.is_error) {
    throw new Error(parsed.result?.trim() || "Claude CLI がエラーを返しました");
  }

  if (typeof parsed.result === "string") {
    return parsed.result;
  }

  return trimmed;
}
