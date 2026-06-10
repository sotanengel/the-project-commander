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
});
