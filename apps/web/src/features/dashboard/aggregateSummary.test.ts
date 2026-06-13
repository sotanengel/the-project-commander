import type { EvmResult } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { aggregateProjectMetrics } from "./aggregateSummary.js";
import type { ProjectSummary } from "./summary.js";

function makeSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    progressPercent: 0,
    workPackageCount: 0,
    projectDuration: 0,
    criticalTaskCount: 0,
    ...overrides,
  };
}

function makeEvm(overrides: Partial<EvmResult> = {}): EvmResult {
  return {
    bac: 0,
    pv: 0,
    ev: 0,
    spi: null,
    sv: 0,
    elapsed: 0,
    forecastDuration: null,
    ...overrides,
  };
}

describe("aggregateProjectMetrics", () => {
  it("空配列なら全て0", () => {
    expect(aggregateProjectMetrics([])).toEqual({
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
    });
  });

  it("ワークパッケージ数で加重平均した全体進捗を返す", () => {
    const result = aggregateProjectMetrics([
      { summary: makeSummary({ progressPercent: 100, workPackageCount: 2 }), evm: makeEvm() },
      { summary: makeSummary({ progressPercent: 0, workPackageCount: 8 }), evm: makeEvm() },
    ]);
    expect(result.progressPercent).toBeCloseTo(20);
    expect(result.workPackageCount).toBe(10);
    expect(result.projectCount).toBe(2);
  });

  it("タスク数とクリティカル数を合算する", () => {
    const result = aggregateProjectMetrics([
      {
        summary: makeSummary({ workPackageCount: 5, criticalTaskCount: 3 }),
        evm: makeEvm(),
      },
      {
        summary: makeSummary({ workPackageCount: 10, criticalTaskCount: 7 }),
        evm: makeEvm(),
      },
    ]);
    expect(result.workPackageCount).toBe(15);
    expect(result.criticalTaskCount).toBe(10);
  });

  it("EVM指標を全PJ合算で算出する", () => {
    const result = aggregateProjectMetrics([
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 10, pv: 5, ev: 4, spi: 0.8 }),
      },
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 10, pv: 5, ev: 6, spi: 1.2 }),
      },
    ]);
    expect(result.plannedPercent).toBeCloseTo(50);
    expect(result.actualPercent).toBeCloseTo(50);
    expect(result.spi).toBeCloseTo(1.0);
  });

  it("SPIバッジ件数を分類する", () => {
    const result = aggregateProjectMetrics([
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 10, pv: 5, ev: 5, spi: 1.0 }),
      },
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 10, pv: 5, ev: 4, spi: 0.9 }),
      },
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 10, pv: 5, ev: 3, spi: 0.5 }),
      },
      {
        summary: makeSummary({ workPackageCount: 1 }),
        evm: makeEvm({ bac: 0, pv: 0, ev: 0, spi: null }),
      },
    ]);
    expect(result.goodCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.behindCount).toBe(1);
    expect(result.unknownCount).toBe(1);
  });
});
