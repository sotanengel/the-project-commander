import type { TaskComment } from "../types.js";
import { CommentSuggestionsResponseSchema } from "./schemas.js";

export interface CommentSuggestionPromptInput {
  projectId: string;
  targetTaskId: string;
  commentBody: string;
  recentComments: TaskComment[];
}

/** MCP read-only ツール名（Claude CLI --allowedTools 用） */
export const COMMENT_SUGGESTION_ALLOWED_MCP_TOOLS = [
  "mcp__the-project-commander__get_project_plan",
  "mcp__the-project-commander__get_critical_path",
  "mcp__the-project-commander__list_risks",
] as const;

/**
 * コメント分析用プロンプト。計画本体は MCP get_project_plan で取得させる。
 */
export function buildCommentSuggestionPrompt(input: CommentSuggestionPromptInput): string {
  const commentsBlock =
    input.recentComments.length === 0
      ? "（なし）"
      : input.recentComments.map((c) => `- [${c.createdAt}] ${c.body}`).join("\n");

  const outputSchema = JSON.stringify(
    CommentSuggestionsResponseSchema.parse({ suggestions: [] }),
    null,
    2,
  );

  return `あなたはプロジェクト管理アシスタントです。ユーザーの進捗コメントを読み、計画への変更提案を JSON のみで返してください。

## 手順
1. MCP ツール \`get_project_plan\` を projectId="${input.projectId}" で呼び出し、最新の計画を取得すること
2. 対象タスク ID "${input.targetTaskId}" とコメント内容を照合し、合理的な変更のみ提案すること
3. **MCP の書き込みツール（update_task, add_tasks, set_dependencies 等）は絶対に使わない**
4. 最終回答は次の JSON スキーマに従うオブジェクトのみ（説明文やコードフェンスは不要だが、フェンスがあっても可）

## 対象タスク ID
${input.targetTaskId}

## 新しいコメント
${input.commentBody}

## 直近のコメント履歴（同タスク）
${commentsBlock}

## 提案の kind
- update_task: taskId と changes（name, description, durationDays, progress, assignee の部分更新）
- create_dependency: dependency（predecessorId, successorId, type, lagDays）
- update_milestone: milestoneId と changes（name, dueDate, status）

各提案には id（一意の短い文字列）, label（ボタン用の短い日本語）, rationale（理由・スケジュール影響の説明）を含めること。
変更が不要な場合は suggestions を空配列にすること。

## 出力 JSON スキーマ（例）
${outputSchema}`;
}
