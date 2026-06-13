import {
  type CommentSuggestion,
  buildLocalCommentSuggestionPrompt,
  parseAndValidateCommentSuggestions,
} from "@tpc/shared";
import type { Db } from "../db.js";
import { loadProjectPlan } from "../repositories/project.js";
import { getTask } from "../repositories/task.js";
import { listCommentsByTask } from "../repositories/taskComment.js";
import type { LlmProvider } from "./types.js";

export interface AnalyzeCommentInput {
  projectId: string;
  taskId: string;
  commentBody: string;
}

const RECENT_COMMENT_LIMIT = 10;

export async function analyzeComment(
  db: Db,
  provider: LlmProvider,
  input: AnalyzeCommentInput,
): Promise<CommentSuggestion[]> {
  const task = getTask(db, input.taskId);
  if (!task || task.projectId !== input.projectId) {
    throw new AnalyzeCommentError("not_found", "タスクが見つかりません");
  }

  const plan = loadProjectPlan(db, input.projectId);
  if (!plan) {
    throw new AnalyzeCommentError("not_found", "プロジェクトが見つかりません");
  }

  const recentComments = listCommentsByTask(db, input.taskId).slice(-RECENT_COMMENT_LIMIT);
  const prompt = buildLocalCommentSuggestionPrompt({
    plan,
    targetTaskId: input.taskId,
    commentBody: input.commentBody,
    recentComments,
  });

  let rawResponse: string;
  try {
    rawResponse = await provider.complete(prompt);
  } catch (e) {
    throw new AnalyzeCommentError(
      "llm_failed",
      e instanceof Error ? e.message : "ローカル LLM の実行に失敗しました",
    );
  }

  try {
    return parseAndValidateCommentSuggestions(rawResponse, plan);
  } catch (e) {
    throw new AnalyzeCommentError(
      "parse_failed",
      e instanceof Error ? e.message : "AI 応答の解析に失敗しました",
    );
  }
}

export type AnalyzeCommentErrorKind = "not_found" | "llm_failed" | "parse_failed";

export class AnalyzeCommentError extends Error {
  constructor(
    readonly kind: AnalyzeCommentErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AnalyzeCommentError";
  }
}
