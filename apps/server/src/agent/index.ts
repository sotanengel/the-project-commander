import type { CommentSuggestion, CommentSuggestionsParseMeta } from "@tpc/shared";
import type { Db } from "../db.js";
import {
  type AnalyzeCommentInput,
  type AnalyzeCommentResult,
  analyzeComment,
} from "./analyzeComment.js";
import { createLlmProvider } from "./createProvider.js";
import { readLocalAgentEnv } from "./env.js";
import type { AgentStatus, LlmProvider } from "./types.js";

export interface LocalAgentService {
  init(): Promise<void>;
  getStatus(): AgentStatus;
  analyzeComment(db: Db, input: AnalyzeCommentInput): Promise<AnalyzeCommentResult>;
}

export class DisabledLocalAgentService implements LocalAgentService {
  private readonly status: AgentStatus = {
    provider: "off",
    ready: false,
    message: "ローカル LLM エージェントが無効です",
  };

  async init(): Promise<void> {}

  getStatus(): AgentStatus {
    return this.status;
  }

  async analyzeComment(): Promise<AnalyzeCommentResult> {
    throw new Error("ローカル LLM エージェントが無効です");
  }
}

export class ActiveLocalAgentService implements LocalAgentService {
  private status: AgentStatus = { provider: "off", ready: false };
  private provider: LlmProvider | null = null;

  constructor(private readonly env = readLocalAgentEnv()) {}

  async init(): Promise<void> {
    const result = await createLlmProvider({ env: this.env });
    this.provider = result.provider;
    this.status = result.status;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async analyzeComment(db: Db, input: AnalyzeCommentInput): Promise<AnalyzeCommentResult> {
    if (!this.status.ready || !this.provider) {
      throw new Error("ローカル LLM エージェントが利用できません");
    }
    return analyzeComment(db, this.provider, input);
  }
}

export function createLocalAgentService(env = readLocalAgentEnv()): LocalAgentService {
  if (env.mode === "off") {
    return new DisabledLocalAgentService();
  }
  return new ActiveLocalAgentService(env);
}
