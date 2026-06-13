import type { Project } from "@tpc/shared";
import {
  FULL_PROJECT_PLAN_SCHEMA,
  buildAiImportManifest,
  buildPromptGuidelinesBlock,
} from "@tpc/shared";

/**
 * 新規プロジェクト作成直後にAIへ渡すフル計画生成プロンプトを組み立てる。
 */
export function buildNewProjectPrompt(project: Project, appOrigin: string): string {
  const manifestUrl = `${appOrigin}/api/projects/${project.id}/ai-import-manifest`;
  const planImportUrl = `${appOrigin}/api/projects/${project.id}/plan-draft-import`;
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
    "以下のプロジェクト概要と詳細に基づき、WBS・依存関係・マイルストーン・リスク・関係者を含むフル計画ドラフトを作成してください。",
    "",
    "【プロジェクト情報】",
    projectInfo,
    "",
    buildPromptGuidelinesBlock(),
    "",
    "【出力形式】次のスキーマに従ったJSONオブジェクトを1つだけ生成してください。",
    FULL_PROJECT_PLAN_SCHEMA,
    "",
    "【重要：フル計画の登録（必須）— Web検索・ブラウジングを使用すること】",
    "生成後、ユーザーにJSONを貼り付けさせるのではなく、必ずWeb検索またはブラウジング機能を使いフル計画をブラウザアプリへ直接送信してください。",
    "ユーザーへの返答に生JSONは含めないでください。登録完了のみ報告してください。",
    "",
    "手順:",
    `1. Web検索・ブラウジングで取り込み仕様を確認: ${manifestUrl}`,
    "2. 次のいずれかでフル計画を登録:",
    `   方法A（推奨）: POST ${planImportUrl}`,
    "        Header: Content-Type: application/json",
    '        Body: {"tasks":[...],"dependencies":[...],"milestones":[...],"risks":[...],"stakeholders":[...]}',
    "   方法B: ブラウザで次のURLを開く（payload に URLエンコードしたフル計画JSON を付与）:",
    `        ${setupUrl}?payload={encodeURIComponent(JSON.stringify(フル計画))}`,
    "",
    "【取り込み仕様（参照用）】",
    JSON.stringify(manifest, null, 2),
  ].join("\n");
}
