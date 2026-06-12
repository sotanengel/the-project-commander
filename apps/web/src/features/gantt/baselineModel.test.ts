import type { Baseline } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  baselineChartDayCount,
  baselinePurposeLines,
  baselineTaskMap,
  chartLegendItems,
  defaultBaselineLabel,
  formatVariance,
  latestBaseline,
  projectDurationVariance,
  taskFinishVariance,
  varianceLegendItems,
} from "./baselineModel.js";

function baseline(overrides: Partial<Baseline> = {}): Baseline {
  return {
    id: "bl1",
    projectId: "p1",
    label: "初期計画",
    createdAt: "2026-06-01T00:00:00.000Z",
    projectDuration: 5,
    tasks: [
      { taskId: "a", name: "a", durationDays: 3, earlyStart: 0, earlyFinish: 3 },
      { taskId: "b", name: "b", durationDays: 2, earlyStart: 3, earlyFinish: 5 },
    ],
    ...overrides,
  };
}

describe("baselineModel", () => {
  describe("taskFinishVariance", () => {
    it("現EFがベースラインEFより遅ければ正の差異", () => {
      expect(taskFinishVariance(7, 5)).toBe(2);
    });

    it("前倒しなら負の差異", () => {
      expect(taskFinishVariance(4, 5)).toBe(-1);
    });

    it("同じなら0", () => {
      expect(taskFinishVariance(5, 5)).toBe(0);
    });
  });

  describe("formatVariance", () => {
    it("遅延は +n日（late トーン）", () => {
      expect(formatVariance(2)).toEqual({ text: "+2日", tone: "late" });
    });

    it("前倒しは -n日（early トーン）", () => {
      expect(formatVariance(-1)).toEqual({ text: "-1日", tone: "early" });
    });

    it("差異なしは ±0（zero トーン）", () => {
      expect(formatVariance(0)).toEqual({ text: "±0", tone: "zero" });
    });
  });

  describe("projectDurationVariance", () => {
    it("プロジェクト全体の期間差異を返す", () => {
      expect(projectDurationVariance(8, baseline())).toBe(3);
      expect(projectDurationVariance(4, baseline())).toBe(-1);
      expect(projectDurationVariance(5, baseline())).toBe(0);
    });
  });

  describe("baselineTaskMap", () => {
    it("taskId で引けるマップを返す", () => {
      const map = baselineTaskMap(baseline());
      expect(map.get("a")?.earlyFinish).toBe(3);
      expect(map.get("b")?.earlyStart).toBe(3);
      expect(map.get("zzz")).toBeUndefined();
    });
  });

  describe("latestBaseline", () => {
    it("createdAt が最新のものを返す", () => {
      const older = baseline({ id: "bl1", createdAt: "2026-06-01T00:00:00.000Z" });
      const newer = baseline({ id: "bl2", createdAt: "2026-06-05T00:00:00.000Z" });
      expect(latestBaseline([older, newer])?.id).toBe("bl2");
      expect(latestBaseline([newer, older])?.id).toBe("bl2");
    });

    it("空配列なら null", () => {
      expect(latestBaseline([])).toBeNull();
    });
  });

  describe("defaultBaselineLabel", () => {
    it("「ベースライン MM/DD」形式（ゼロ埋め）", () => {
      expect(defaultBaselineLabel(new Date(2026, 5, 9))).toBe("ベースライン 06/09");
      expect(defaultBaselineLabel(new Date(2026, 11, 25))).toBe("ベースライン 12/25");
    });
  });

  describe("baselineChartDayCount", () => {
    it("ベースラインのEFが現計画より長ければチャート日数を広げる", () => {
      // 現計画は10日相当、ベースラインの最大EFは20 → 20 + 余白2
      const bl = baseline({
        tasks: [{ taskId: "a", name: "a", durationDays: 20, earlyStart: 0, earlyFinish: 20 }],
      });
      expect(baselineChartDayCount(10, bl)).toBe(22);
    });

    it("ベースラインが短ければ現計画の日数を維持する", () => {
      expect(baselineChartDayCount(10, baseline())).toBe(10);
    });

    it("ベースライン未選択なら現計画の日数のまま", () => {
      expect(baselineChartDayCount(10, null)).toBe(10);
    });
  });

  describe("baselinePurposeLines", () => {
    it("目的説明の文章を複数行返す", () => {
      const lines = baselinePurposeLines();
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
      }
    });

    it("スナップショット・差・保存タイミングに触れている", () => {
      const text = baselinePurposeLines().join("");
      expect(text).toContain("スナップショット");
      expect(text).toContain("差");
      expect(text).toContain("保存");
    });
  });

  describe("varianceLegendItems", () => {
    it("遅延・前倒し・計画通りの3項目を返す", () => {
      const items = varianceLegendItems();
      expect(items.map((i) => i.tone)).toEqual(["late", "early", "zero"]);
    });

    it("サンプル表記は formatVariance と一致する", () => {
      const items = varianceLegendItems();
      const byTone = new Map(items.map((i) => [i.tone, i]));
      expect(byTone.get("late")?.sample).toBe(formatVariance(2).text);
      expect(byTone.get("early")?.sample).toBe(formatVariance(-1).text);
      expect(byTone.get("zero")?.sample).toBe(formatVariance(0).text);
    });

    it("説明に意味と色が含まれる", () => {
      const byTone = new Map(varianceLegendItems().map((i) => [i.tone, i]));
      expect(byTone.get("late")?.description).toContain("遅延");
      expect(byTone.get("late")?.description).toContain("赤");
      expect(byTone.get("early")?.description).toContain("前倒し");
      expect(byTone.get("early")?.description).toContain("緑");
      expect(byTone.get("zero")?.description).toContain("計画どおり");
    });
  });

  describe("chartLegendItems", () => {
    it("ベースライン表示中・今日線ありなら4項目（ベースライン/現在計画/進捗/今日線）", () => {
      const items = chartLegendItems({ hasBaseline: true, hasTodayLine: true });
      expect(items.map((i) => i.key)).toEqual(["baseline", "current", "progress", "today"]);
    });

    it("ベースライン未選択ならベースライン項目を含まない", () => {
      const items = chartLegendItems({ hasBaseline: false, hasTodayLine: true });
      expect(items.map((i) => i.key)).toEqual(["current", "progress", "today"]);
    });

    it("今日線がチャート範囲外なら今日線の項目を含まない", () => {
      const items = chartLegendItems({ hasBaseline: false, hasTodayLine: false });
      expect(items.map((i) => i.key)).toEqual(["current", "progress"]);
    });

    it("ラベルが日本語で要素の意味を説明している", () => {
      const byKey = new Map(
        chartLegendItems({ hasBaseline: true, hasTodayLine: true }).map((i) => [i.key, i.label]),
      );
      expect(byKey.get("baseline")).toContain("ベースライン");
      expect(byKey.get("current")).toContain("現在");
      expect(byKey.get("progress")).toContain("進捗");
      expect(byKey.get("today")).toContain("今日");
    });
  });
});
