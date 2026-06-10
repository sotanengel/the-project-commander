import type { ProjectPlan, Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  addDays,
  barGeometry,
  buildDayCells,
  buildGanttRows,
  chartDayCount,
  diffDays,
  todayLineX,
} from "./ganttModel.js";

function task(id: string, durationDays: number, parentId: string | null = null): Task {
  return {
    id,
    projectId: "p1",
    parentId,
    name: id,
    description: "",
    durationDays,
    progress: 0,
    assignee: "",
    sortOrder: 0,
  };
}

const basePlan = (): ProjectPlan => ({
  project: {
    id: "p1",
    name: "PJ",
    description: "",
    startDate: "2026-06-10",
    createdAt: "2026-06-10T00:00:00.000Z",
  },
  tasks: [task("a", 3), task("b", 2)],
  dependencies: [
    { id: "d1", projectId: "p1", predecessorId: "a", successorId: "b", type: "FS", lagDays: 0 },
  ],
  milestones: [],
  cpm: {
    projectDuration: 5,
    criticalPath: ["a", "b"],
    tasks: [
      {
        taskId: "a",
        earlyStart: 0,
        earlyFinish: 3,
        lateStart: 0,
        lateFinish: 3,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
      {
        taskId: "b",
        earlyStart: 3,
        earlyFinish: 5,
        lateStart: 3,
        lateFinish: 5,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
    ],
  },
});

describe("ganttModel", () => {
  it("addDays / diffDays がUTC基準で計算される", () => {
    expect(addDays("2026-06-10", 3)).toBe("2026-06-13");
    expect(diffDays("2026-06-10", "2026-06-13")).toBe(3);
  });

  it("buildDayCells が日セルを生成する", () => {
    const cells = buildDayCells("2026-06-10", 3);
    expect(cells).toHaveLength(3);
    expect(cells[0]?.date).toBe("2026-06-10");
  });

  it("buildGanttRows が葉タスク行を返す", () => {
    const rows = buildGanttRows(basePlan());
    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("leaf");
  });

  it("chartDayCount はCPM期間と余白を考慮する", () => {
    expect(chartDayCount(basePlan())).toBeGreaterThanOrEqual(7);
  });

  it("barGeometry は最小幅を保証する", () => {
    expect(barGeometry(0, 0.1).width).toBeGreaterThanOrEqual(3);
  });

  it("todayLineX は範囲外なら null", () => {
    expect(todayLineX("2026-06-10", 5, "2020-01-01")).toBeNull();
  });
});
