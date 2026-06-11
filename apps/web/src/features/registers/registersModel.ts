import type { Milestone, Risk, Stakeholder } from "@tpc/shared";

/** 低・中・高の3段階レベル */
export type Level = Risk["probability"];

// ---- 日本語ラベル ⇔ enum 値の変換マップ（定義はここに集約） ----

/** レベル（low/medium/high）の日本語ラベル */
export const LEVEL_LABELS: Record<Level, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

/** リスク状態（open/watching/closed）の日本語ラベル */
export const RISK_STATUS_LABELS: Record<Risk["status"], string> = {
  open: "対応中",
  watching: "監視中",
  closed: "完了",
};

/** マイルストーン状態（pending/done）の日本語ラベル */
export const MILESTONE_STATUS_LABELS: Record<Milestone["status"], string> = {
  pending: "予定",
  done: "達成",
};

// ---- リスクスコア ----

/** レベルの数値換算: 低=1 / 中=2 / 高=3 */
const LEVEL_SCORE: Record<Level, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** リスクスコア = 確率 × 影響（1〜9） */
export function riskScore(probability: Level, impact: Level): number {
  return LEVEL_SCORE[probability] * LEVEL_SCORE[impact];
}

/** スコアの深刻度区分: 7以上=high（赤）/ 4〜6=medium（黄）/ 3以下=low（灰） */
export type ScoreSeverity = "high" | "medium" | "low";

export function scoreSeverity(score: number): ScoreSeverity {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

/** スコア降順の安定ソート（元配列は変更しない） */
export function sortRisksByScoreDesc(risks: readonly Risk[]): Risk[] {
  return [...risks].sort(
    (a, b) => riskScore(b.probability, b.impact) - riskScore(a.probability, a.impact),
  );
}

// ---- ステークホルダー関与区分（PMBOK 権力・関心グリッド） ----

/**
 * 権力・関心グリッドによる関与区分:
 * 高影響×高関心=「重点的に管理」/ 高影響×低・中関心=「満足を維持」/
 * 低・中影響×高関心=「情報を提供」/ その他=「監視」
 */
export function engagementCategory(
  influence: Stakeholder["influence"],
  interest: Stakeholder["interest"],
): string {
  if (influence === "high") {
    return interest === "high" ? "重点的に管理" : "満足を維持";
  }
  return interest === "high" ? "情報を提供" : "監視";
}
