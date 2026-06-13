/** マイルストーン提案の品質ルール */
export const MILESTONE_GUIDELINES = [
  "プロジェクト startDate を基準に dueDate（YYYY-MM-DD）を設定する。",
  "4〜8件の主要イベント（キックオフ、承認、完了、本番など）を列挙する。",
  "WBSフェーズの完了タイミングと整合する日付にする。",
  "status は未達成なら pending、既に達成済みの想定なら done。",
].join("\n- ");
