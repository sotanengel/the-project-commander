import {
  DEPENDENCY_GUIDELINES,
  FULL_PROJECT_PLAN_SCHEMA,
  MILESTONE_GUIDELINES,
  RISK_GUIDELINES,
  STAKEHOLDER_GUIDELINES,
  WBS_DRAFT_OUTPUT_SCHEMA,
  WBS_GUIDELINES,
} from "@tpc/shared";
import type { ProjectPlan } from "@tpc/shared";

export type PromptPurpose =
  | "wbs_draft"
  | "task_breakdown"
  | "dependencies"
  | "milestones"
  | "risk_identify"
  | "stakeholders";

const SCHEMAS: Record<PromptPurpose, string> = {
  wbs_draft: WBS_DRAFT_OUTPUT_SCHEMA,
  task_breakdown: `{
  "tasks": [{ "name": "タスク名", "durationDays": 3, "description": "作業内容" }]
}`,
  dependencies: `{
  "dependencies": [{ "predecessorName": "先行タスク名", "successorName": "後続タスク名", "type": "FS", "lagDays": 0 }]
}`,
  milestones: `{
  "milestones": [{ "name": "マイルストーン名", "dueDate": "YYYY-MM-DD", "status": "pending" }]
}`,
  risk_identify: `{
  "risks": [{ "title": "リスク", "probability": "low|medium|high", "impact": "low|medium|high", "response": "対応方針" }]
}`,
  stakeholders: `{
  "stakeholders": [{ "name": "氏名", "role": "役割", "influence": "high", "interest": "medium", "note": "関与方針" }]
}`,
};

const INSTRUCTIONS: Record<PromptPurpose, string> = {
  wbs_draft: [
    "与えられたプロジェクト情報をもとに、WBSのドラフト（階層タスク）を作成してください。",
    "【WBS生成ルール】",
    `- ${WBS_GUIDELINES}`,
  ].join("\n"),
  task_breakdown: [
    "選択したタスクをさらに分解したワークパッケージ案を作成してください。",
    "葉タスクには durationDays と description を必ず付与してください。",
  ].join("\n"),
  dependencies: [
    "既存タスク一覧を参照し、タスク間の依存関係を提案してください。",
    "【依存関係ルール】",
    `- ${DEPENDENCY_GUIDELINES}`,
  ].join("\n"),
  milestones: [
    "プロジェクトの startDate と既存タスク・スケジュールを踏まえ、主要マイルストーンを提案してください。",
    "【マイルストーンルール】",
    `- ${MILESTONE_GUIDELINES}`,
  ].join("\n"),
  risk_identify: [
    "プロジェクトのリスクを洗い出し、登録簿形式で列挙してください。",
    "【リスクルール】",
    `- ${RISK_GUIDELINES}`,
  ].join("\n"),
  stakeholders: [
    "プロジェクトの関係者（ステークホルダー）を洗い出し、登録簿形式で列挙してください。",
    "【関係者ルール】",
    `- ${STAKEHOLDER_GUIDELINES}`,
  ].join("\n"),
};

export function buildPrompt(plan: ProjectPlan, purpose: PromptPurpose): string {
  const leafTasks = plan.tasks.filter((t) => {
    const hasChild = plan.tasks.some((c) => c.parentId === t.id);
    return !hasChild;
  });

  const projectJson = JSON.stringify(
    {
      project: plan.project,
      tasks: plan.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        parentId: t.parentId,
        durationDays: t.durationDays,
        progress: t.progress,
        description: t.description,
      })),
      leafTaskNames: leafTasks.map((t) => t.name),
      dependencies: plan.dependencies,
      milestones: plan.milestones,
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
    "【出力形式】次のスキーマに従ったJSONオブジェクトを1つだけ返してください。",
    "説明文・前置き・コードフェンス（```）は不要です。",
    SCHEMAS[purpose],
  ].join("\n");
}

/** フル計画スキーマ（参照用エクスポート） */
export { FULL_PROJECT_PLAN_SCHEMA };
