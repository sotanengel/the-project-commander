import type { Risk } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  LEVEL_LABELS,
  MILESTONE_STATUS_LABELS,
  RISK_STATUS_LABELS,
  engagementCategory,
  powerInterestGridRows,
  riskMatrixRows,
  riskScore,
  scoreSeverity,
  sortRisksByScoreDesc,
} from "./registersModel.js";

describe("riskScore", () => {
  it("低=1/中=2/高=3 として確率×影響を返す", () => {
    expect(riskScore("low", "low")).toBe(1);
    expect(riskScore("low", "medium")).toBe(2);
    expect(riskScore("medium", "medium")).toBe(4);
    expect(riskScore("medium", "high")).toBe(6);
    expect(riskScore("high", "high")).toBe(9);
  });
});

describe("scoreSeverity", () => {
  it("7以上は high（赤）", () => {
    expect(scoreSeverity(7)).toBe("high");
    expect(scoreSeverity(9)).toBe("high");
  });
  it("4〜6は medium（黄）", () => {
    expect(scoreSeverity(4)).toBe("medium");
    expect(scoreSeverity(6)).toBe("medium");
  });
  it("3以下は low（灰）", () => {
    expect(scoreSeverity(1)).toBe("low");
    expect(scoreSeverity(3)).toBe("low");
  });
});

describe("sortRisksByScoreDesc", () => {
  const risk = (id: string, probability: Risk["probability"], impact: Risk["impact"]): Risk => ({
    id,
    projectId: "p1",
    title: `risk-${id}`,
    probability,
    impact,
    response: "",
    status: "open",
  });

  it("スコア降順に並べ替える", () => {
    const sorted = sortRisksByScoreDesc([
      risk("a", "low", "low"), // 1
      risk("b", "high", "high"), // 9
      risk("c", "medium", "medium"), // 4
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("同スコアは元の順序を維持し、元配列を破壊しない", () => {
    const input = [
      risk("a", "medium", "medium"),
      risk("b", "low", "high"),
      risk("c", "low", "low"),
    ];
    const sorted = sortRisksByScoreDesc(input);
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("engagementCategory（PMBOK 権力・関心グリッド）", () => {
  it("高影響×高関心は「重点的に管理」", () => {
    expect(engagementCategory("high", "high")).toBe("重点的に管理");
  });
  it("高影響×低・中関心は「満足を維持」", () => {
    expect(engagementCategory("high", "low")).toBe("満足を維持");
    expect(engagementCategory("high", "medium")).toBe("満足を維持");
  });
  it("低・中影響×高関心は「情報を提供」", () => {
    expect(engagementCategory("low", "high")).toBe("情報を提供");
    expect(engagementCategory("medium", "high")).toBe("情報を提供");
  });
  it("その他は「監視」", () => {
    expect(engagementCategory("low", "low")).toBe("監視");
    expect(engagementCategory("low", "medium")).toBe("監視");
    expect(engagementCategory("medium", "low")).toBe("監視");
    expect(engagementCategory("medium", "medium")).toBe("監視");
  });
});

describe("riskMatrixRows（3×3 確率×影響マトリクス凡例）", () => {
  it("行=確率（高→低）、列=影響（低→高）の 3×3 を返す", () => {
    const rows = riskMatrixRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveLength(3);
    }
    expect(rows.map((row) => row[0]?.probability)).toEqual(["high", "medium", "low"]);
    expect(rows[0]?.map((cell) => cell.impact)).toEqual(["low", "medium", "high"]);
  });

  it("各セルのスコアは riskScore と一致する（1〜9）", () => {
    const rows = riskMatrixRows();
    for (const row of rows) {
      for (const cell of row) {
        expect(cell.score).toBe(riskScore(cell.probability, cell.impact));
      }
    }
    // 角のセルを直接確認
    expect(rows[0]?.[2]).toMatchObject({ probability: "high", impact: "high", score: 9 });
    expect(rows[2]?.[0]).toMatchObject({ probability: "low", impact: "low", score: 1 });
  });

  it("各セルの深刻度は scoreSeverity と一致する（高×高=9 は high=赤）", () => {
    const rows = riskMatrixRows();
    for (const row of rows) {
      for (const cell of row) {
        expect(cell.severity).toBe(scoreSeverity(cell.score));
      }
    }
    expect(rows[0]?.[2]?.severity).toBe("high");
    expect(rows[1]?.[1]?.severity).toBe("medium");
    expect(rows[2]?.[0]?.severity).toBe("low");
  });
});

describe("powerInterestGridRows（2×2 権力・関心グリッド凡例）", () => {
  it("行=影響力（高→低）、列=関心（低→高）の 2×2 を返す", () => {
    const rows = powerInterestGridRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveLength(2);
    }
    expect(rows.map((row) => row[0]?.influence)).toEqual(["high", "low"]);
    expect(rows[0]?.map((cell) => cell.interest)).toEqual(["low", "high"]);
  });

  it("各セルのラベルは engagementCategory と一致する", () => {
    const rows = powerInterestGridRows();
    for (const row of rows) {
      for (const cell of row) {
        expect(cell.label).toBe(engagementCategory(cell.influence, cell.interest));
      }
    }
    expect(rows[0]?.[1]?.label).toBe("重点的に管理");
    expect(rows[0]?.[0]?.label).toBe("満足を維持");
    expect(rows[1]?.[1]?.label).toBe("情報を提供");
    expect(rows[1]?.[0]?.label).toBe("監視");
  });
});

describe("日本語ラベルマップ", () => {
  it("レベルのラベル", () => {
    expect(LEVEL_LABELS).toEqual({ low: "低", medium: "中", high: "高" });
  });
  it("リスク状態のラベル", () => {
    expect(RISK_STATUS_LABELS).toEqual({ open: "対応中", watching: "監視中", closed: "完了" });
  });
  it("マイルストーン状態のラベル", () => {
    expect(MILESTONE_STATUS_LABELS).toEqual({ pending: "予定", done: "達成" });
  });
});
