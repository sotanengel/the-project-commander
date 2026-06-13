import { extractClaudePrintResult, runClaudePrintCommand } from "./claudeCommand.js";
import { CliJobQueue } from "./cliJobQueue.js";
import { createMcpConfigFile } from "./mcpConfig.js";

export { extractClaudePrintResult };

export interface ClaudeAnalysisSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  isStarted(): boolean;
  runAnalysis(prompt: string): Promise<string>;
}

export interface ClaudeCliSessionOptions {
  claudeBin: string;
  port: number;
  timeoutMs: number;
  skipPermissions?: boolean;
  mcpPublicUrl?: string;
}

export class ClaudeCliSession implements ClaudeAnalysisSession {
  private readonly queue = new CliJobQueue();
  private mcpConfigPath: string | null = null;
  private cleanupMcp: (() => void) | null = null;
  private started = false;

  constructor(private readonly options: ClaudeCliSessionOptions) {}

  async start(): Promise<void> {
    if (this.started) return;
    if (this.options.mcpPublicUrl) {
      const { createMcpConfigFileFromUrl } = await import("./claudeCommand.js");
      const cfg = createMcpConfigFileFromUrl(this.options.mcpPublicUrl);
      this.mcpConfigPath = cfg.configPath;
      this.cleanupMcp = cfg.cleanup;
    } else {
      const cfg = createMcpConfigFile(this.options.port);
      this.mcpConfigPath = cfg.configPath;
      this.cleanupMcp = cfg.cleanup;
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    this.cleanupMcp?.();
    this.mcpConfigPath = null;
    this.cleanupMcp = null;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  runAnalysis(prompt: string): Promise<string> {
    return this.queue.enqueue(async () => {
      if (!this.mcpConfigPath) {
        throw new Error("Claude CLI セッションが開始されていません");
      }
      await this.runClaudeCommand("/reset");
      return this.runClaudeCommand(prompt);
    });
  }

  private runClaudeCommand(prompt: string): Promise<string> {
    if (!this.mcpConfigPath) {
      return Promise.reject(new Error("Claude CLI セッションが開始されていません"));
    }
    return runClaudePrintCommand({
      claudeBin: this.options.claudeBin,
      prompt,
      mcpConfigPath: this.mcpConfigPath,
      timeoutMs: this.options.timeoutMs,
      skipPermissions: this.options.skipPermissions,
    });
  }
}
