import type { CpmResult, Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { formatPercent, summarizePlan } from "./summary.js";

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    projectId: "p1",
    parentId: null,
    name: `タスク${seq}`,
    description: "",
    durationDays: 1,
    progress: 0,
    assignee: "",
    sortOrder: seq,
    ...overrides,
  };
}

function makeCpm(overrides: Partial<CpmResult> = {}): CpmResult {
  return { tasks: [], projectDuration: 0, criticalPath: [], ...overrides };
}

describe("summarizePlan", () => {
  it("タスク0件なら全て0", () => {
    const s = summarizePlan([], makeCpm());
    expect(s).toEqual({
      progressPercent: 0,
      workPackageCount: 0,
      projectDuration: 0,
      criticalTaskCount: 0,
    });
  });

  it("葉タスクの進捗を所要日数で重み付け平均する", () => {
    // 2日で100% + 8日で0% => (100*2 + 0*8) / 10 = 20%
    const tasks = [
      makeTask({ id: "a", durationDays: 2, progress: 100 }),
      makeTask({ id: "b", durationDays: 8, progress: 0 }),
    ];
    const s = summarizePlan(tasks, makeCpm({ projectDuration: 10, criticalPath: ["a", "b"] }));
    expect(s.progressPercent).toBeCloseTo(20);
    expect(s.workPackageCount).toBe(2);
    expect(s.projectDuration).toBe(10);
    expect(s.criticalTaskCount).toBe(2);
  });

  it("サマリタスクは数えず、葉（ワークパッケージ）のみ数える", () => {
    const tasks = [
      makeTask({ id: "parent", durationDays: 0 }),
      makeTask({ id: "c1", parentId: "parent", durationDays: 3, progress: 50 }),
      makeTask({ id: "c2", parentId: "parent", durationDays: 1, progress: 100 }),
    ];
    // (50*3 + 100*1) / 4 = 62.5
    const s = summarizePlan(tasks, makeCpm({ projectDuration: 4 }));
    expect(s.workPackageCount).toBe(2);
    expect(s.progressPercent).toBeCloseTo(62.5);
  });

  it("所要日数が全て0でも0除算にならない", () => {
    const tasks = [makeTask({ durationDays: 0, progress: 100 })];
    const s = summarizePlan(tasks, makeCpm());
    expect(s.progressPercent).toBe(0);
    expect(s.workPackageCount).toBe(1);
  });
});

describe("formatPercent", () => {
  it("整数に丸めて%を付ける", () => {
    expect(formatPercent(62.5)).toBe("63%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("99.5%以上100%未満は100%と誤解させないよう99%に丸める", () => {
    expect(formatPercent(99.6)).toBe("99%");
  });
});
