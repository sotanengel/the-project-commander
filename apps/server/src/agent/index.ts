import type { CommentSuggestion } from "@tpc/shared";
import type { Db } from "../db.js";
import { type AnalyzeCommentInput, analyzeComment } from "./analyzeComment.js";
import type { ClaudeAnalysisSession } from "./claudeCliSession.js";
import { ClaudeCliSession } from "./claudeCliSession.js";
import { ClaudeHostClientSession } from "./claudeHostClientSession.js";
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
  private session: ClaudeAnalysisSession | null = null;

  constructor(private readonly env = readCliAgentEnv()) {}

  async init(): Promise<void> {
    this.status = await checkCliAgentStatus({
      provider: this.env.provider,
      claudeBin: this.env.claudeBin,
      claudeHostUrl: this.env.claudeHostUrl,
    });
    if (!this.status.ready) return;

    if (this.env.claudeHostUrl) {
      this.session = new ClaudeHostClientSession({
        hostAgentUrl: this.env.claudeHostUrl,
        mcpPublicUrl: this.env.mcpPublicUrl,
        timeoutMs: this.env.timeoutMs,
        skipPermissions: this.env.skipPermissions,
      });
    } else {
      this.session = new ClaudeCliSession({
        claudeBin: this.env.claudeBin,
        port: this.env.port,
        timeoutMs: this.env.timeoutMs,
        skipPermissions: this.env.skipPermissions,
      });
    }

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
