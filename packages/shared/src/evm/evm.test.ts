import { describe, expect, it } from "vitest";
import type { ProjectPlan, ScheduledTask, Task } from "../types.js";
import { computeEvm } from "./index.js";

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

function makeScheduled(
  taskId: string,
  earlyStart: number,
  earlyFinish: number,
  overrides: Partial<ScheduledTask> = {},
): ScheduledTask {
  return {
    taskId,
    earlyStart,
    earlyFinish,
    lateStart: earlyStart,
    lateFinish: earlyFinish,
    totalFloat: 0,
    freeFloat: 0,
    isCritical: true,
    ...overrides,
  };
}

function makePlan(
  startDate: string,
  tasks: Task[],
  scheduled: ScheduledTask[],
  projectDuration: number,
): ProjectPlan {
  return {
    project: {
      id: "p1",
      name: "テスト",
      description: "",
      startDate,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    tasks,
    dependencies: [],
    milestones: [],
    cpm: {
      tasks: scheduled,
      projectDuration,
      criticalPath: scheduled.filter((s) => s.isCritical).map((s) => s.taskId),
    },
  };
}

describe("computeEvm", () => {
  it("開始前（today < startDate）は elapsed=0, PV=0, SPI=null", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 0 })];
    const plan = makePlan("2026-06-10", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-01");
    expect(r.elapsed).toBe(0);
    expect(r.bac).toBe(10);
    expect(r.pv).toBe(0);
    expect(r.ev).toBe(0);
    expect(r.spi).toBeNull();
    expect(r.sv).toBe(0);
    expect(r.forecastDuration).toBeNull();
  });

  it("進行中・遅延: 経過5日/所要10日 progress20% → PV=5, EV=2, SPI=0.4", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 20 })];
    const plan = makePlan("2026-06-05", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.elapsed).toBe(5);
    expect(r.bac).toBe(10);
    expect(r.pv).toBeCloseTo(5);
    expect(r.ev).toBeCloseTo(2);
    expect(r.spi).toBeCloseTo(0.4);
    expect(r.sv).toBeCloseTo(-3);
    // 10 / 0.4 = 25日かかる見込み
    expect(r.forecastDuration).toBeCloseTo(25);
  });

  it("進行中・先行: 経過5日/所要10日 progress80% → SPI=1.6", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 80 })];
    const plan = makePlan("2026-06-05", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.pv).toBeCloseTo(5);
    expect(r.ev).toBeCloseTo(8);
    expect(r.spi).toBeCloseTo(1.6);
    expect(r.sv).toBeCloseTo(3);
    expect(r.forecastDuration).toBeCloseTo(6.25);
  });

  it("進行中・順調: PV=EV で SPI=1", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 50 })];
    const plan = makePlan("2026-06-05", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.spi).toBeCloseTo(1);
    expect(r.sv).toBeCloseTo(0);
    expect(r.forecastDuration).toBeCloseTo(10);
  });

  it("ESが進んだタスクは経過日数がESを超えた分だけPVに計上される", () => {
    // a: ES=0 dur=4（完全に計画期間内）, b: ES=4 dur=6（elapsed=5でPV=1日分）
    const tasks = [
      makeTask({ id: "a", durationDays: 4, progress: 100 }),
      makeTask({ id: "b", durationDays: 6, progress: 0 }),
    ];
    const plan = makePlan(
      "2026-06-05",
      tasks,
      [makeScheduled("a", 0, 4), makeScheduled("b", 4, 10)],
      10,
    );
    const r = computeEvm(plan, "2026-06-10");
    // PV = 4 * 1 + 6 * clamp((5-4)/6) = 4 + 1 = 5
    expect(r.pv).toBeCloseTo(5);
    expect(r.ev).toBeCloseTo(4);
    expect(r.spi).toBeCloseTo(0.8);
  });

  it("まだ開始予定でないタスク（elapsed < ES）のPVは0", () => {
    const tasks = [makeTask({ id: "a", durationDays: 5, progress: 0 })];
    const plan = makePlan("2026-06-08", tasks, [makeScheduled("a", 7, 12)], 12);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.elapsed).toBe(2);
    expect(r.pv).toBe(0);
    expect(r.spi).toBeNull();
  });

  it("完了後（today > 終了予定）は elapsed が projectDuration にクランプされ PV=BAC", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 100 })];
    const plan = makePlan("2026-01-01", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.elapsed).toBe(10);
    expect(r.pv).toBeCloseTo(10);
    expect(r.ev).toBeCloseTo(10);
    expect(r.spi).toBeCloseTo(1);
    expect(r.forecastDuration).toBeCloseTo(10);
  });

  it("タスク0件なら BAC=0, PV=0, EV=0, SPI=null", () => {
    const plan = makePlan("2026-06-01", [], [], 0);
    const r = computeEvm(plan, "2026-06-10");
    expect(r).toEqual({
      bac: 0,
      pv: 0,
      ev: 0,
      spi: null,
      sv: 0,
      elapsed: 0,
      forecastDuration: null,
    });
  });

  it("所要日数0のタスクは0除算にならずPV/EVに影響しない", () => {
    const tasks = [
      makeTask({ id: "a", durationDays: 0, progress: 100 }),
      makeTask({ id: "b", durationDays: 10, progress: 50 }),
    ];
    const plan = makePlan(
      "2026-06-05",
      tasks,
      [makeScheduled("a", 0, 0), makeScheduled("b", 0, 10)],
      10,
    );
    const r = computeEvm(plan, "2026-06-10");
    expect(r.bac).toBe(10);
    expect(r.pv).toBeCloseTo(5);
    expect(r.ev).toBeCloseTo(5);
    expect(Number.isNaN(r.pv)).toBe(false);
  });

  it("EV=0 かつ PV>0 なら SPI=0、完了予測は null（推定不能）", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 0 })];
    const plan = makePlan("2026-06-05", tasks, [makeScheduled("a", 0, 10)], 10);
    const r = computeEvm(plan, "2026-06-10");
    expect(r.spi).toBe(0);
    expect(r.forecastDuration).toBeNull();
  });

  it("today に Date オブジェクトを渡してもローカル日付で計算される", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 50 })];
    const plan = makePlan("2026-06-05", tasks, [makeScheduled("a", 0, 10)], 10);
    // ローカル時刻の正午 → 日付部分のみが使われ elapsed=5
    const r = computeEvm(plan, new Date(2026, 5, 10, 12, 34, 56));
    expect(r.elapsed).toBe(5);
    expect(r.pv).toBeCloseTo(5);
  });

  it("不正な日付文字列はエラーを投げる", () => {
    const plan = makePlan("2026-06-05", [], [], 0);
    expect(() => computeEvm(plan, "not-a-date")).toThrow();
  });

  it("cpm.tasks に対応する Task が見つからないエントリは無視される", () => {
    const tasks = [makeTask({ id: "a", durationDays: 10, progress: 50 })];
    const plan = makePlan(
      "2026-06-05",
      tasks,
      [makeScheduled("a", 0, 10), makeScheduled("ghost", 0, 5)],
      10,
    );
    const r = computeEvm(plan, "2026-06-10");
    expect(r.bac).toBe(10);
    expect(r.pv).toBeCloseTo(5);
  });
});
