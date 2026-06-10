import { describe, expect, it } from "vitest";
import type { Dependency, Task } from "../types.js";
import { CycleError, computeCpm, topologicalSort } from "./index.js";

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

function dep(
  predecessorId: string,
  successorId: string,
  lagDays = 0,
  type: Dependency["type"] = "FS",
): Dependency {
  return {
    id: `${predecessorId}->${successorId}`,
    projectId: "p1",
    predecessorId,
    successorId,
    type,
    lagDays,
  };
}

describe("computeCpm (FS基本ケース)", () => {
  it("直列チェーンでは全タスクがクリティカル", () => {
    const result = computeCpm([task("a", 2), task("b", 3)], [dep("a", "b")]);
    expect(result.projectDuration).toBe(5);
    expect(result.criticalPath).toEqual(["a", "b"]);
    const b = result.tasks.find((t) => t.taskId === "b");
    expect(b?.earlyStart).toBe(2);
    expect(b?.totalFloat).toBe(0);
  });

  it("並行パスでは長い方がクリティカルになり、短い方にフロートが付く", () => {
    // a(1) -> b(5) -> d(1) / a -> c(2) -> d
    const result = computeCpm(
      [task("a", 1), task("b", 5), task("c", 2), task("d", 1)],
      [dep("a", "b"), dep("a", "c"), dep("b", "d"), dep("c", "d")],
    );
    expect(result.projectDuration).toBe(7);
    expect(result.criticalPath).toEqual(["a", "b", "d"]);
    const c = result.tasks.find((t) => t.taskId === "c");
    expect(c?.totalFloat).toBe(3);
    expect(c?.freeFloat).toBe(3);
  });

  it("ラグを加味する", () => {
    const result = computeCpm([task("a", 2), task("b", 1)], [dep("a", "b", 3)]);
    expect(result.projectDuration).toBe(6);
  });

  it("依存なしのタスク群は0日目から並行開始", () => {
    const result = computeCpm([task("a", 2), task("b", 4)], []);
    expect(result.projectDuration).toBe(4);
    expect(result.tasks.every((t) => t.earlyStart === 0)).toBe(true);
  });

  it("サマリタスク（子を持つ）はCPM対象外", () => {
    const result = computeCpm([task("parent", 0), task("child", 3, "parent")], []);
    expect(result.tasks.map((t) => t.taskId)).toEqual(["child"]);
  });
});

describe("topologicalSort", () => {
  it("循環依存で CycleError を投げる", () => {
    const tasks = [task("a", 1), task("b", 1)];
    expect(() => topologicalSort(tasks, [dep("a", "b"), dep("b", "a")])).toThrow(CycleError);
  });

  it("computeCpm も循環依存で CycleError を投げる", () => {
    const tasks = [task("a", 1), task("b", 1)];
    expect(() => computeCpm(tasks, [dep("a", "b"), dep("b", "a")])).toThrow(CycleError);
  });
});

function find(result: ReturnType<typeof computeCpm>, id: string) {
  const t = result.tasks.find((t) => t.taskId === id);
  if (!t) throw new Error(`task not found: ${id}`);
  return t;
}

describe("computeCpm (SS依存)", () => {
  it("SS+ラグ: 後続のESは先行のES+lag以降", () => {
    // a(4) -SS+1-> b(2)
    const result = computeCpm([task("a", 4), task("b", 2)], [dep("a", "b", 1, "SS")]);
    const a = find(result, "a");
    const b = find(result, "b");
    expect(b.earlyStart).toBe(1);
    expect(b.earlyFinish).toBe(3);
    expect(result.projectDuration).toBe(4);
    // バックワード: LS_a ≤ LS_b - lag
    expect(b.lateFinish).toBe(4);
    expect(b.lateStart).toBe(2);
    expect(a.lateStart).toBe(0);
    expect(a.totalFloat).toBe(0);
    expect(a.isCritical).toBe(true);
    expect(b.totalFloat).toBe(1);
    expect(b.freeFloat).toBe(1);
    // a の SS フリーフロート: ES_b - lag - ES_a = 0
    expect(a.freeFloat).toBe(0);
    expect(result.criticalPath).toEqual(["a"]);
  });

  it("SSのバックワードパスは先行のLSのみを制約しLFを引き下げない", () => {
    // a(4) -SS+0-> b(1): aのLFはプロジェクト終了まで自由
    const result = computeCpm([task("a", 4), task("b", 1)], [dep("a", "b", 0, "SS")]);
    const a = find(result, "a");
    expect(a.lateFinish).toBe(4);
    expect(a.lateStart).toBe(0);
    expect(a.totalFloat).toBe(0);
  });
});

describe("computeCpm (FF依存)", () => {
  it("FF: 後続のEFは先行のEF+lag以降（EF > ES+duration になりうる）", () => {
    // a(3) -FF+0-> b(2)
    const result = computeCpm([task("a", 3), task("b", 2)], [dep("a", "b", 0, "FF")]);
    const a = find(result, "a");
    const b = find(result, "b");
    expect(b.earlyStart).toBe(0);
    expect(b.earlyFinish).toBe(3); // max(0+2, EF_a+0=3)
    expect(result.projectDuration).toBe(3);
    // バックワード: LF_a ≤ LF_b - lag
    expect(b.lateFinish).toBe(3);
    expect(b.lateStart).toBe(1);
    expect(a.lateFinish).toBe(3);
    expect(a.lateStart).toBe(0);
    expect(a.totalFloat).toBe(0);
    expect(a.isCritical).toBe(true);
    // b: ESは1日遅らせてもEF=3のまま → totalFloat=1、ただしEFは末尾なので freeFloat=0
    expect(b.totalFloat).toBe(1);
    expect(b.freeFloat).toBe(0);
    // a の FF フリーフロート: EF_b - lag - EF_a = 0
    expect(a.freeFloat).toBe(0);
  });

  it("FF+ラグ: EFがlag分後ろにずれる", () => {
    const result = computeCpm([task("a", 3), task("b", 2)], [dep("a", "b", 2, "FF")]);
    const b = find(result, "b");
    expect(b.earlyFinish).toBe(5);
    expect(result.projectDuration).toBe(5);
  });

  it("FF制約がES+durationより弱い場合は EF = ES + duration", () => {
    // a(1) -FF-10-> b(5): 制約 EF_b ≥ EF_a - 10 = -9 → EF_b = 5
    const result = computeCpm([task("a", 1), task("b", 5)], [dep("a", "b", -10, "FF")]);
    const b = find(result, "b");
    expect(b.earlyStart).toBe(0);
    expect(b.earlyFinish).toBe(5);
  });
});

describe("computeCpm (SF依存)", () => {
  it("SF: 後続のEFは先行のES+lag以降", () => {
    // a(2) -SF+4-> b(3)
    const result = computeCpm([task("a", 2), task("b", 3)], [dep("a", "b", 4, "SF")]);
    const a = find(result, "a");
    const b = find(result, "b");
    expect(b.earlyStart).toBe(0);
    expect(b.earlyFinish).toBe(4); // max(0+3, ES_a+4=4)
    expect(result.projectDuration).toBe(4);
    // バックワード: LS_a ≤ LF_b - lag
    expect(b.lateFinish).toBe(4);
    expect(b.lateStart).toBe(1);
    expect(a.lateStart).toBe(0);
    expect(a.totalFloat).toBe(0);
    expect(a.isCritical).toBe(true);
    expect(b.totalFloat).toBe(1);
    // a の SF フリーフロート: EF_b - lag - ES_a = 0
    expect(a.freeFloat).toBe(0);
  });
});

describe("computeCpm (リード=負のラグ)", () => {
  it("FSの負ラグで後続が先行の完了前に開始する", () => {
    const result = computeCpm([task("a", 4), task("b", 2)], [dep("a", "b", -2)]);
    const b = find(result, "b");
    expect(b.earlyStart).toBe(2);
    expect(result.projectDuration).toBe(4);
    expect(result.criticalPath).toEqual(["a", "b"]);
  });

  it("負ラグでもESは0未満にならない", () => {
    // a(1) -FS-3-> b(5): 制約 ES_b ≥ -2 → ES_b = 0
    const result = computeCpm([task("a", 1), task("b", 5)], [dep("a", "b", -3)]);
    const b = find(result, "b");
    expect(b.earlyStart).toBe(0);
    expect(b.earlyFinish).toBe(5);
  });
});

describe("computeCpm (フロート計算)", () => {
  it("トータルフロートとフリーフロートが異なるチェーン", () => {
    // a(1)->b(1)->c(1) と並行して d(10)。フロートはチェーン末尾のcに集中する
    const result = computeCpm(
      [task("a", 1), task("b", 1), task("c", 1), task("d", 10)],
      [dep("a", "b"), dep("b", "c")],
    );
    expect(result.projectDuration).toBe(10);
    const a = find(result, "a");
    const b = find(result, "b");
    const c = find(result, "c");
    expect(a.totalFloat).toBe(7);
    expect(a.freeFloat).toBe(0);
    expect(b.totalFloat).toBe(7);
    expect(b.freeFloat).toBe(0);
    expect(c.totalFloat).toBe(7);
    expect(c.freeFloat).toBe(7); // 後続なし: projectDuration - EF
    expect(result.criticalPath).toEqual(["d"]);
  });

  it("フリーフロートはプロジェクト終了を遅らせない範囲に制限される（freeFloat ≤ totalFloat）", () => {
    // a(4) -FS-> y(1) と x(2) -SS-> y。
    // ES_y=4 なので x の SS 余裕は 4 に見えるが、x を 4 日遅らせると
    // EF_x=6 > projectDuration=5 となりプロジェクトが延びる。
    // freeFloat は projectDuration - EF も上限に取り 3 になる。
    const result = computeCpm(
      [task("a", 4), task("x", 2), task("y", 1)],
      [dep("a", "y", 0, "FS"), dep("x", "y", 0, "SS")],
    );
    expect(result.projectDuration).toBe(5);
    const x = find(result, "x");
    expect(x.totalFloat).toBe(3);
    expect(x.freeFloat).toBe(3);
    expect(x.freeFloat).toBeLessThanOrEqual(x.totalFloat);
  });
});

describe("computeCpm (エッジケース)", () => {
  it("duration 0 のマイルストーンを通過できる", () => {
    const result = computeCpm(
      [task("a", 2), task("m", 0), task("b", 3)],
      [dep("a", "m"), dep("m", "b")],
    );
    const m = find(result, "m");
    expect(m.earlyStart).toBe(2);
    expect(m.earlyFinish).toBe(2);
    expect(result.projectDuration).toBe(5);
    expect(result.criticalPath).toEqual(["a", "m", "b"]);
    expect(m.isCritical).toBe(true);
  });

  it("タスクが空なら空の結果", () => {
    const result = computeCpm([], []);
    expect(result.tasks).toEqual([]);
    expect(result.projectDuration).toBe(0);
    expect(result.criticalPath).toEqual([]);
  });

  it("サマリタスクへの依存は無視される", () => {
    const result = computeCpm(
      [task("parent", 0), task("child", 3, "parent"), task("x", 2)],
      [dep("parent", "x")],
    );
    const x = find(result, "x");
    expect(x.earlyStart).toBe(0);
  });

  it("同一ペアへの複数依存は全制約を満たす", () => {
    // a(3) -SS+1-> b(2) と a -FS+0-> b: FSが支配して ES_b = 3
    const result = computeCpm(
      [task("a", 3), task("b", 2)],
      [dep("a", "b", 1, "SS"), { ...dep("a", "b", 0, "FS"), id: "a->b#2" }],
    );
    const b = find(result, "b");
    expect(b.earlyStart).toBe(3);
    expect(result.projectDuration).toBe(5);
  });
});

describe("computeCpm (依存タイプ複合グラフ)", () => {
  it("SS/FS/FFの混在グラフで正しいスケジュールとクリティカルパスを返す", () => {
    // a(3); b(4) は a から SS+1; c(2) は a から FS かつ b から FF+1; d(2) は c から FS
    const result = computeCpm(
      [task("a", 3), task("b", 4), task("c", 2), task("d", 2)],
      [dep("a", "b", 1, "SS"), dep("a", "c", 0, "FS"), dep("b", "c", 1, "FF"), dep("c", "d")],
    );
    const a = find(result, "a");
    const b = find(result, "b");
    const c = find(result, "c");
    const d = find(result, "d");

    // フォワード
    expect(a.earlyStart).toBe(0);
    expect(a.earlyFinish).toBe(3);
    expect(b.earlyStart).toBe(1);
    expect(b.earlyFinish).toBe(5);
    expect(c.earlyStart).toBe(3);
    expect(c.earlyFinish).toBe(6); // max(3+2, EF_b+1=6)
    expect(d.earlyStart).toBe(6);
    expect(d.earlyFinish).toBe(8);
    expect(result.projectDuration).toBe(8);

    // バックワード
    expect(d.lateStart).toBe(6);
    expect(c.lateFinish).toBe(6);
    expect(c.lateStart).toBe(4);
    expect(b.lateFinish).toBe(5); // LF_c - 1
    expect(b.lateStart).toBe(1);
    expect(a.lateFinish).toBe(4); // FS: LS_c
    expect(a.lateStart).toBe(0); // SS: LS_b - 1 = 0 が支配

    // フロート
    expect(a.totalFloat).toBe(0);
    expect(b.totalFloat).toBe(0);
    expect(c.totalFloat).toBe(1); // ESを1遅らせてもEF=6のまま
    expect(d.totalFloat).toBe(0);
    expect(c.freeFloat).toBe(0); // FS制約 ES_d - EF_c = 0
    expect(a.freeFloat).toBe(0);
    expect(b.freeFloat).toBe(0);
    expect(d.freeFloat).toBe(0);

    expect(result.criticalPath).toEqual(["a", "b", "d"]);
  });
});
