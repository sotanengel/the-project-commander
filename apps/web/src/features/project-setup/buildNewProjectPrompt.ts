import type { Project } from "@tpc/shared";
import { buildAiImportManifest } from "@tpc/shared";

/**
 * 新規プロジェクト作成直後にAIへ渡すWBSドラフト生成プロンプトを組み立てる。
 */
export function buildNewProjectPrompt(project: Project, appOrigin: string): string {
  const manifestUrl = `${appOrigin}/api/projects/${project.id}/ai-import-manifest`;
  const bulkUrl = `${appOrigin}/api/projects/${project.id}/tasks/bulk`;
  const setupUrl = `${appOrigin}/projects/${project.id}/setup`;
  const manifest = buildAiImportManifest(project, appOrigin);

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
    "【出力形式】次のスキーマに従ったJSONオブジェクトを1つだけ生成してください。",
    manifest.outputSchema,
    "",
    "【重要：タスクの登録（必須）— Web検索・ブラウジングを使用すること】",
    "WBS生成後、ユーザーにJSONを貼り付けさせるのではなく、必ずWeb検索またはブラウジング機能を使いタスクをブラウザアプリへ直接送信してください。",
    "ユーザーへの返答に生JSONは含めないでください。登録完了のみ報告してください。",
    "",
    "手順:",
    `1. Web検索・ブラウジングで取り込み仕様を確認: ${manifestUrl}`,
    "2. 次のいずれかでタスクを登録:",
    `   方法A（推奨）: POST ${bulkUrl}`,
    "        Header: Content-Type: application/json",
    '        Body: {"tasks": [生成した階層タスク配列]}',
    "   方法B: ブラウザで次のURLを開く（payload に URLエンコードした JSON を付与）:",
    `        ${setupUrl}?payload={encodeURIComponent(JSON.stringify({tasks:[...]}))}`,
    "",
    "【取り込み仕様（参照用）】",
    JSON.stringify(manifest, null, 2),
  ].join("\n");
}
