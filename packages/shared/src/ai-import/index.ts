import { FULL_PROJECT_PLAN_SCHEMA } from "../ai-prompts/schemas.js";
import type { BulkTaskInput, Project } from "../types.js";
import type { PlanDraftInput } from "./parsePlanDraft.js";
import { encodePlanDraftPayload } from "./parsePlanDraft.js";

/** @deprecated ai-prompts/schemas の WBS_DRAFT_OUTPUT_SCHEMA を使用 */
export { WBS_DRAFT_OUTPUT_SCHEMA } from "../ai-prompts/schemas.js";

export interface AiImportManifest {
  project: { id: string; name: string };
  instruction: string;
  methods: Array<
    | {
        type: "http_post";
        url: string;
        method: "POST";
        headers: Record<string, string>;
        bodyExample: string;
      }
    | {
        type: "browser_navigate";
        urlPattern: string;
        description: string;
      }
  >;
  outputSchema: string;
}

/** 生成AIのWeb検索・ブラウジング向けフル計画取り込み仕様 */
export function buildAiImportManifest(project: Project, appOrigin: string): AiImportManifest {
  const planImportUrl = `${appOrigin}/api/projects/${project.id}/plan-draft-import`;
  const setupUrl = `${appOrigin}/projects/${project.id}/setup`;

  return {
    project: { id: project.id, name: project.name },
    instruction:
      "フル計画（WBS・依存・マイルストーン・リスク・関係者）生成後、Web検索またはブラウジング機能を使い以下の方法でこのアプリに送信してください。各葉タスクにはタスク詳細ページ用の description（作業内容）を必ず付与し、assignee（担当）は任意（未設定可）です。ユーザーへの返答に生JSONは含めないでください。",
    methods: [
      {
        type: "http_post",
        url: planImportUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        bodyExample:
          '{"tasks":[...],"dependencies":[...],"milestones":[...],"risks":[...],"stakeholders":[...]}',
      },
      {
        type: "browser_navigate",
        urlPattern: `${setupUrl}?payload={urlencoded_json}`,
        description:
          "payload には encodeURIComponent(JSON.stringify(フル計画JSON)) を指定してブラウザでアクセスすると自動取り込みされます",
      },
    ],
    outputSchema: FULL_PROJECT_PLAN_SCHEMA,
  };
}

/** AIがブラウザで開く取り込みURL用に payload をエンコードする（タスクのみ・後方互換） */
export function encodeImportPayload(tasks: BulkTaskInput[]): string {
  return encodeURIComponent(JSON.stringify({ tasks }));
}

/** フル計画を URL ペイロードにエンコード */
export function encodeFullPlanPayload(draft: PlanDraftInput): string {
  return encodePlanDraftPayload(draft);
}

/** ブラウザ遷移用の取り込みURLを組み立てる（フル計画） */
export function buildFullPlanNavigateUrl(
  appOrigin: string,
  projectId: string,
  draft: PlanDraftInput,
): string {
  return `${appOrigin}/projects/${projectId}/setup?payload=${encodePlanDraftPayload(draft)}`;
}

/** @deprecated buildFullPlanNavigateUrl を使用 */
export function buildImportNavigateUrl(
  appOrigin: string,
  projectId: string,
  tasks: BulkTaskInput[],
): string {
  return `${appOrigin}/projects/${projectId}/setup?payload=${encodeImportPayload(tasks)}`;
}
