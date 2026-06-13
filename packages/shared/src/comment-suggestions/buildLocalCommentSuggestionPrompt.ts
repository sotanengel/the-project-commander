import type { ProjectPlan, TaskComment } from "../types.js";
import { serializePlanContextWithinBudget } from "./planContext.js";
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

  const planContext = serializePlanContextWithinBudget(input.plan, {
    targetTaskId: input.targetTaskId,
    commentBody: input.commentBody,
  });

  const otherTaskId =
    input.plan.tasks.find((t) => t.id !== input.targetTaskId)?.id ?? input.targetTaskId;

  const examples = JSON.stringify({
    suggestions: [
      {
        id: "s1",
        kind: "update_task",
        label: "進捗を100%に更新",
        rationale: "コメントの完了報告に合わせる",
        taskId: input.targetTaskId,
        changes: { progress: 100 },
      },
      {
        id: "s2",
        kind: "update_task",
        label: "作業内容を追記",
        rationale: "コメントの実施内容を description に反映",
        taskId: input.targetTaskId,
        changes: { description: "既存の作業内容。今回: API実装を完了。" },
      },
      {
        id: "s3",
        kind: "update_task",
        label: "関連タスクの進捗を更新",
        rationale: "コメントで言及された他タスクへの影響",
        taskId: otherTaskId,
        changes: { progress: 50 },
      },
    ],
  });

  const outputSchema = JSON.stringify(CommentSuggestionsResponseSchema.parse({ suggestions: [] }));

  return `プロジェクト管理アシスタント。進捗コメントを読み、計画変更提案を JSON オブジェクトのみで返す。不要なら suggestions:[]。

対象タスクID: ${input.targetTaskId}
コメント: ${input.commentBody}
履歴: ${commentsBlock}

計画:
${planContext}

kind は必ず次のいずれか（スネークケース）:
- update_task: taskId + changes
- create_dependency: dependency
- update_milestone: milestoneId + changes

changes で使えるフィールド: name, description(作業内容), progress, durationDays, assignee
- コメントの作業実施内容は FOCUS の description を読み、追記・更新案を changes.description に入れる
- 他タスクへの影響がある場合は別 suggestion として update_task を追加
- taskId / milestoneId は INDEX の UUID をそのまま使う（タスク名は不可）

例: ${examples}

出力形式: ${outputSchema}`;
}
