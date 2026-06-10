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
