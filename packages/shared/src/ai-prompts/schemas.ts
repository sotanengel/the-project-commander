/** 新規プロジェクト向け WBS のみ（後方互換） */
export const WBS_DRAFT_OUTPUT_SCHEMA = `{
  "tasks": [
    { "name": "フェーズ名", "durationDays": 0, "children": [
      { "name": "ワークパッケージ", "durationDays": 3, "description": "作業内容" }
    ]}
  ]
}`;

/** フル計画一括取り込み用スキーマ */
export const FULL_PROJECT_PLAN_SCHEMA = `{
  "tasks": [
    { "name": "フェーズ名", "durationDays": 0, "children": [
      { "name": "ワークパッケージ", "durationDays": 3, "description": "作業内容", "assignee": "任意" }
    ]}
  ],
  "dependencies": [
    { "predecessorName": "先行タスク名", "successorName": "後続タスク名", "type": "FS", "lagDays": 0 }
  ],
  "milestones": [
    { "name": "マイルストーン名", "dueDate": "YYYY-MM-DD", "status": "pending" }
  ],
  "risks": [
    { "title": "リスク", "probability": "medium", "impact": "high", "response": "対応方針" }
  ],
  "stakeholders": [
    { "name": "氏名", "role": "役割", "influence": "high", "interest": "medium", "note": "関与方針" }
  ]
}`;
