import type { ProjectPlan, TaskComment } from "../types.js";
import { serializePlanContext } from "./planContext.js";
import { CommentSuggestionsResponseSchema } from "./schemas.js";

export interface LocalCommentSuggestionPromptInput {
  plan: ProjectPlan;
  targetTaskId: string;
  commentBody: string;
  recentComments: TaskComment[];
}

/**
 * ローカル LLM 向けプロンプト。計画本体をプロンプトに埋め込む（MCP 不要）。
 */
export function buildLocalCommentSuggestionPrompt(
  input: LocalCommentSuggestionPromptInput,
): string {
  const commentsBlock =
    input.recentComments.length === 0
      ? "（なし）"
      : input.recentComments.map((c) => `- [${c.createdAt}] ${c.body}`).join("\n");

  const planContext = serializePlanContext(input.plan, { targetTaskId: input.targetTaskId });

  const outputSchema = JSON.stringify(CommentSuggestionsResponseSchema.parse({ suggestions: [] }));

  return `プロジェクト管理アシスタント。進捗コメントを読み、計画変更提案を JSON オブジェクトのみで返す。不要なら suggestions:[]。

対象タスクID: ${input.targetTaskId}
コメント: ${input.commentBody}
履歴: ${commentsBlock}

計画:
${planContext}

kind: update_task(taskId+changes), create_dependency(dependency), update_milestone(milestoneId+changes)
各提案に id, label(短い日本語), rationale を付ける。id は計画内の UUID をそのまま使う。

出力形式: ${outputSchema}`;
}
