import type { ProjectPlan } from "@tpc/shared";

export type PromptPurpose = "wbs_draft" | "task_breakdown" | "risk_identify" | "dependencies";

const SCHEMAS: Record<PromptPurpose, string> = {
  wbs_draft: `{
  "tasks": [
    { "name": "フェーズ名", "durationDays": 5, "children": [{ "name": "ワークパッケージ" }] }
  ]
}`,
  task_breakdown: `{
  "tasks": [{ "name": "タスク名", "durationDays": 3, "description": "任意" }]
}`,
  risk_identify: `{
  "risks": [{ "title": "リスク", "probability": "low|medium|high", "impact": "low|medium|high", "response": "対応方針" }]
}`,
  dependencies: `{
  "dependencies": [{ "predecessorName": "先行タスク名", "successorName": "後続タスク名", "type": "FS", "lagDays": 0 }]
}`,
};

const INSTRUCTIONS: Record<PromptPurpose, string> = {
  wbs_draft: "与えられたプロジェクト情報をもとに、WBSのドラフト（階層タスク）を作成してください。",
  task_breakdown: "選択したタスクをさらに分解したワークパッケージ案を作成してください。",
  risk_identify: "プロジェクトのリスクを洗い出し、登録簿形式で列挙してください。",
  dependencies: "タスク間の依存関係（FS/SS/FF/SF）を提案してください。タスク名で指定してください。",
};

export function buildPrompt(plan: ProjectPlan, purpose: PromptPurpose): string {
  const projectJson = JSON.stringify(
    {
      project: plan.project,
      tasks: plan.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        parentId: t.parentId,
        durationDays: t.durationDays,
        progress: t.progress,
      })),
      dependencies: plan.dependencies,
      risks: plan.milestones,
    },
    null,
    2,
  );
  return [
    "あなたはプロジェクトマネジメントのアシスタントです。",
    INSTRUCTIONS[purpose],
    "",
    "【現在のプロジェクトJSON】",
    projectJson,
    "",
    "【出力形式】次のJSONスキーマのみを返してください（説明文は不要）:",
    SCHEMAS[purpose],
  ].join("\n");
}
