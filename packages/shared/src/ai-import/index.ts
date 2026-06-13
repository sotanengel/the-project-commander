import type { BulkTaskInput, Project } from "../types.js";

export const WBS_DRAFT_OUTPUT_SCHEMA = `{
  "tasks": [
    { "name": "フェーズ名", "durationDays": 5, "children": [{ "name": "ワークパッケージ" }] }
  ]
}`;

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

/** 生成AIのWeb検索・ブラウジング向け取り込み仕様 */
export function buildAiImportManifest(project: Project, appOrigin: string): AiImportManifest {
  const bulkUrl = `${appOrigin}/api/projects/${project.id}/tasks/bulk`;
  const setupUrl = `${appOrigin}/projects/${project.id}/setup`;

  return {
    project: { id: project.id, name: project.name },
    instruction:
      "WBS生成後、Web検索またはブラウジング機能を使い、以下のいずれかの方法でタスクをこのアプリに送信してください。ユーザーへの返答に生JSONは含めないでください。",
    methods: [
      {
        type: "http_post",
        url: bulkUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        bodyExample:
          '{"tasks":[{"name":"フェーズ名","durationDays":5,"children":[{"name":"ワークパッケージ"}]}]}',
      },
      {
        type: "browser_navigate",
        urlPattern: `${setupUrl}?payload={urlencoded_json}`,
        description:
          "payload には encodeURIComponent(JSON.stringify({tasks:[...]})) を指定してブラウザでアクセスすると自動取り込みされます",
      },
    ],
    outputSchema: WBS_DRAFT_OUTPUT_SCHEMA,
  };
}

/** AIがブラウザで開く取り込みURL用に payload をエンコードする */
export function encodeImportPayload(tasks: BulkTaskInput[]): string {
  return encodeURIComponent(JSON.stringify({ tasks }));
}

/** ブラウザ遷移用の取り込みURLを組み立てる */
export function buildImportNavigateUrl(
  appOrigin: string,
  projectId: string,
  tasks: BulkTaskInput[],
): string {
  return `${appOrigin}/projects/${projectId}/setup?payload=${encodeImportPayload(tasks)}`;
}
