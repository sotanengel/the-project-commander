import { buildWbsTree } from "@tpc/shared";
import type { CpmResult, Task } from "@tpc/shared";

/** ダッシュボードのカードに表示するプロジェクト進捗サマリ */
export interface ProjectSummary {
  /** 所要日数で重み付けした葉タスク進捗の加重平均（0-100） */
  progressPercent: number;
  /** ワークパッケージ（葉タスク）数 */
  workPackageCount: number;
  /** CPMによるプロジェクト全体の所要日数 */
  projectDuration: number;
  /** クリティカルパス上のタスク数 */
  criticalTaskCount: number;
}

/**
 * プロジェクト計画から進捗サマリを計算する純粋関数。
 * 進捗はWBSツリーのロールアップ（所要日数で重み付け）をルート間でさらに加重平均する。
 */
export function summarizePlan(tasks: Task[], cpm: CpmResult): ProjectSummary {
  const roots = buildWbsTree(tasks);
  let totalDuration = 0;
  let weightedProgress = 0;
  let workPackageCount = 0;
  for (const node of roots) {
    totalDuration += node.rollup.durationDays;
    weightedProgress += node.rollup.progress * node.rollup.durationDays;
    workPackageCount += node.rollup.workPackageCount;
  }
  return {
    progressPercent: totalDuration > 0 ? weightedProgress / totalDuration : 0,
    workPackageCount,
    projectDuration: cpm.projectDuration,
    criticalTaskCount: cpm.criticalPath.length,
  };
}

/**
 * 進捗率の表示用フォーマット。
 * 未完了（100%未満）を四捨五入で「100%」と見せないよう、99%超は切り捨てる。
 */
export function formatPercent(percent: number): string {
  const rounded = percent > 99 && percent < 100 ? 99 : Math.round(percent);
  return `${rounded}%`;
}

/** SPIバッジの判定レベル */
export type SpiLevel = "good" | "warning" | "behind" | "unknown";

export interface SpiBadge {
  level: SpiLevel;
  label: string;
}

/**
 * SPI（スケジュール効率指数）をバッジ表示用に分類する純粋関数。
 * - SPI >= 1.0: 緑「順調」
 * - 0.85 <= SPI < 1.0: 黄「やや遅延」
 * - SPI < 0.85: 赤「遅延」
 * - null（計測不能 = PV=0）: 灰「—」
 */
export function classifySpi(spi: number | null): SpiBadge {
  if (spi === null) return { level: "unknown", label: "—" };
  if (spi >= 1.0) return { level: "good", label: "順調" };
  if (spi >= 0.85) return { level: "warning", label: "やや遅延" };
  return { level: "behind", label: "遅延" };
}
