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

  const outputSchema = JSON.stringify(
    CommentSuggestionsResponseSchema.parse({ suggestions: [] }),
    null,
    2,
  );

  return `あなたはプロジェクト管理アシスタントです。ユーザーの進捗コメントを読み、計画への変更提案を JSON のみで返してください。

## 手順
1. 下記の計画コンテキストを読み、対象タスクとコメント内容を照合すること
2. 合理的な変更のみ提案すること（過剰な提案は避ける）
3. 最終回答は次の JSON スキーマに従うオブジェクトのみ（説明文は不要。コードフェンスがあっても可）

## 対象タスク ID
${input.targetTaskId}

## 新しいコメント
${input.commentBody}

## 直近のコメント履歴（同タスク）
${commentsBlock}

## 計画コンテキスト
${planContext}

## 提案の kind
- update_task: taskId と changes（name, description, durationDays, progress, assignee の部分更新）
- create_dependency: dependency（predecessorId, successorId, type, lagDays）
- update_milestone: milestoneId と changes（name, dueDate, status）

各提案には id（一意の短い文字列）, label（ボタン用の短い日本語）, rationale（理由・スケジュール影響の説明）を含めること。
変更が不要な場合は suggestions を空配列にすること。
taskId / milestoneId / predecessorId / successorId は計画コンテキストの id をそのまま使うこと。

## 出力 JSON スキーマ（例）
${outputSchema}`;
}
