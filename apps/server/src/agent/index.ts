import type { CommentSuggestion } from "@tpc/shared";
import type { Db } from "../db.js";
import { type AnalyzeCommentInput, analyzeComment } from "./analyzeComment.js";
import { ClaudeCliSession } from "./claudeCliSession.js";
import { type CliAgentStatus, checkCliAgentStatus, readCliAgentEnv } from "./cliAgentStatus.js";

export interface CliAgentService {
  init(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): CliAgentStatus;
  analyzeComment(db: Db, input: AnalyzeCommentInput): Promise<CommentSuggestion[]>;
}

export class DisabledCliAgentService implements CliAgentService {
  getStatus(): CliAgentStatus {
    return {
      provider: "off",
      ready: false,
      mcpConnected: false,
      message: "TPC_CLI_AGENT が無効です",
    };
  }

  async init(): Promise<void> {}

  async stop(): Promise<void> {}

  async analyzeComment(): Promise<CommentSuggestion[]> {
    throw new Error("CLI エージェントが無効です");
  }
}

export class ClaudeCliAgentService implements CliAgentService {
  private status: CliAgentStatus = {
    provider: "claude",
    ready: false,
    mcpConnected: false,
  };
  private session: ClaudeCliSession | null = null;

  constructor(
    private readonly env = readCliAgentEnv(),
    private readonly sessionFactory = (
      port: number,
      timeoutMs: number,
      claudeBin: string,
      skipPermissions: boolean,
    ) => new ClaudeCliSession({ claudeBin, port, timeoutMs, skipPermissions }),
  ) {}

  async init(): Promise<void> {
    this.status = await checkCliAgentStatus({
      provider: this.env.provider,
      claudeBin: this.env.claudeBin,
    });
    if (!this.status.ready) return;

    this.session = this.sessionFactory(
      this.env.port,
      this.env.timeoutMs,
      this.env.claudeBin,
      this.env.skipPermissions,
    );
    await this.session.start();
    this.status = {
      ...this.status,
      mcpConnected: this.session.isStarted(),
    };
  }

  async stop(): Promise<void> {
    await this.session?.stop();
    this.session = null;
  }

  getStatus(): CliAgentStatus {
    return this.status;
  }

  async analyzeComment(db: Db, input: AnalyzeCommentInput): Promise<CommentSuggestion[]> {
    if (!this.status.ready || !this.session) {
      throw new Error("CLI エージェントが利用できません");
    }
    return analyzeComment(db, this.session, input);
  }
}

export function createCliAgentService(env = readCliAgentEnv()): CliAgentService {
  if (env.provider === "off") {
    return new DisabledCliAgentService();
  }
  return new ClaudeCliAgentService(env);
}
