import type { Project } from "@tpc/shared";
import { WBS_DRAFT_OUTPUT_SCHEMA } from "../ai-assist/prompts.js";

/**
 * 新規プロジェクト作成直後にAIへ渡すWBSドラフト生成プロンプトを組み立てる。
 */
export function buildNewProjectPrompt(project: Project, appOrigin: string): string {
  const aiAssistUrl = `${appOrigin}/projects/${project.id}/ai`;
  const mcpUrl = `${appOrigin}/mcp`;

  const projectInfo = JSON.stringify(
    {
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.startDate,
    },
    null,
    2,
  );

  return [
    "あなたはプロジェクトマネジメントのアシスタントです。",
    "以下のプロジェクト概要と詳細に基づき、実行可能な階層WBS（フェーズ→ワークパッケージ）のドラフトを作成してください。",
    "各タスクには現実的な所要日数（durationDays）を付与し、開始日を考慮した全体スケジュール感が伝わる構成にしてください。",
    "",
    "【プロジェクト情報】",
    projectInfo,
    "",
    "【出力形式】次のスキーマに従ったJSONオブジェクトを1つだけ返してください。",
    "説明文・前置き・コードフェンス（```）は不要です。",
    WBS_DRAFT_OUTPUT_SCHEMA,
    "",
    "【取り込み先（ローカル環境）】",
    `- 手動取り込み画面: ${aiAssistUrl}`,
    "  → 生成したJSONを「AI応答JSONの取り込み」欄に貼り付けて検証・取り込み",
    `- MCP自動登録: ${mcpUrl}`,
    `  → add_tasks ツールを projectId: "${project.id}" で呼び出し、上記スキーマの tasks 配列を渡す`,
  ].join("\n");
}
