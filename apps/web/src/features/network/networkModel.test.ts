import type { Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import { edgeLabel, leafTasksInWbsOrder } from "./networkModel.js";

describe("edgeLabel", () => {
  it("FSかつラグ0はラベルなし（null）", () => {
    expect(edgeLabel("FS", 0)).toBeNull();
  });

  it("FS以外のタイプはラグ0でもタイプのみ表示する", () => {
    expect(edgeLabel("SS", 0)).toBe("SS");
    expect(edgeLabel("FF", 0)).toBe("FF");
    expect(edgeLabel("SF", 0)).toBe("SF");
  });

  it("正のラグは「タイプ+ラグ」形式", () => {
    expect(edgeLabel("SS", 2)).toBe("SS+2");
    expect(edgeLabel("FF", 10)).toBe("FF+10");
  });

  it("負のラグ（リード）は「タイプ-ラグ」形式", () => {
    expect(edgeLabel("FS", -1)).toBe("FS-1");
    expect(edgeLabel("SF", -3)).toBe("SF-3");
  });

  it("FSでもラグがあればラベルを表示する", () => {
    expect(edgeLabel("FS", 5)).toBe("FS+5");
  });
});

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: "p1",
    parentId: null,
    name: partial.id,
    description: "",
    durationDays: 1,
    progress: 0,
    assignee: "",
    sortOrder: 0,
    ...partial,
  };
}

describe("leafTasksInWbsOrder", () => {
  it("葉タスク（子を持たないタスク）のみをWBS順（深さ優先・sortOrder順）で返す", () => {
    const tasks: Task[] = [
      task({ id: "B", sortOrder: 1 }),
      task({ id: "A", sortOrder: 0 }),
      task({ id: "A2", parentId: "A", sortOrder: 1 }),
      task({ id: "A1", parentId: "A", sortOrder: 0 }),
      task({ id: "B1", parentId: "B", sortOrder: 0 }),
    ];
    expect(leafTasksInWbsOrder(tasks).map((t) => t.id)).toEqual(["A1", "A2", "B1"]);
  });

  it("サマリタスク（子を持つタスク）は含まれない", () => {
    const tasks: Task[] = [
      task({ id: "root", sortOrder: 0 }),
      task({ id: "child", parentId: "root", sortOrder: 0 }),
    ];
    const leaves = leafTasksInWbsOrder(tasks);
    expect(leaves.map((t) => t.id)).toEqual(["child"]);
  });

  it("空配列なら空配列を返す", () => {
    expect(leafTasksInWbsOrder([])).toEqual([]);
  });
});
