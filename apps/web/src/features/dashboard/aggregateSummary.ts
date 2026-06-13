import type { EvmResult } from "@tpc/shared";
import { classifySpi } from "./summary.js";
import type { ProjectSummary } from "./summary.js";

export interface ProjectMetrics {
  summary: ProjectSummary;
  evm: EvmResult;
}

/** 全プロジェクト横断の集計サマリ */
export interface AggregateSummary {
  projectCount: number;
  /** ワークパッケージ数で重み付けした全体進捗（0-100） */
  progressPercent: number;
  workPackageCount: number;
  criticalTaskCount: number;
  /** 合算 EVM に基づく予定進捗率 */
  plannedPercent: number;
  /** 合算 EVM に基づく実績進捗率 */
  actualPercent: number;
  /** 合算 SPI（PV=0 なら null） */
  spi: number | null;
  goodCount: number;
  warningCount: number;
  behindCount: number;
  unknownCount: number;
}

/**
 * 各プロジェクトのサマリ・EVMから全件集計を算出する純粋関数。
 */
export function aggregateProjectMetrics(items: ProjectMetrics[]): AggregateSummary {
  if (items.length === 0) {
    return {
      projectCount: 0,
      progressPercent: 0,
      workPackageCount: 0,
      criticalTaskCount: 0,
      plannedPercent: 0,
      actualPercent: 0,
      spi: null,
      goodCount: 0,
      warningCount: 0,
      behindCount: 0,
      unknownCount: 0,
    };
  }

  let totalWeight = 0;
  let weightedProgress = 0;
  let workPackageCount = 0;
  let criticalTaskCount = 0;
  let totalBac = 0;
  let totalPv = 0;
  let totalEv = 0;
  let goodCount = 0;
  let warningCount = 0;
  let behindCount = 0;
  let unknownCount = 0;

  for (const { summary, evm } of items) {
    const weight = summary.workPackageCount;
    totalWeight += weight;
    weightedProgress += summary.progressPercent * weight;
    workPackageCount += summary.workPackageCount;
    criticalTaskCount += summary.criticalTaskCount;
    totalBac += evm.bac;
    totalPv += evm.pv;
    totalEv += evm.ev;

    const badge = classifySpi(evm.spi);
    switch (badge.level) {
      case "good":
        goodCount += 1;
        break;
      case "warning":
        warningCount += 1;
        break;
      case "behind":
        behindCount += 1;
        break;
      default:
        unknownCount += 1;
        break;
    }
  }

  const progressPercent = totalWeight > 0 ? weightedProgress / totalWeight : 0;
  const plannedPercent = totalBac > 0 ? (totalPv / totalBac) * 100 : 0;
  const actualPercent = totalBac > 0 ? (totalEv / totalBac) * 100 : 0;
  const spi = totalPv > 0 ? totalEv / totalPv : null;

  return {
    projectCount: items.length,
    progressPercent,
    workPackageCount,
    criticalTaskCount,
    plannedPercent,
    actualPercent,
    spi,
    goodCount,
    warningCount,
    behindCount,
    unknownCount,
  };
}
