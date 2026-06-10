import { describe, expect, it } from "vitest";
import type { Task } from "../types.js";
import { buildWbsTree, flattenWbsTree } from "./index.js";

function task(id: string, parentId: string | null, durationDays = 1, progress = 0): Task {
  return {
    id,
    projectId: "p1",
    parentId,
    name: id,
    description: "",
    durationDays,
    progress,
    assignee: "",
    sortOrder: 0,
  };
}

describe("buildWbsTree", () => {
  it("階層を構築し、サマリの所要日数と進捗をロールアップする", () => {
    const tree = buildWbsTree([
      task("root", null, 0),
      task("a", "root", 2, 100),
      task("b", "root", 6, 50),
    ]);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root?.children).toHaveLength(2);
    expect(root?.rollup.durationDays).toBe(8);
    expect(root?.rollup.progress).toBeCloseTo((100 * 2 + 50 * 6) / 8);
    expect(root?.rollup.workPackageCount).toBe(2);
  });

  it("flattenWbsTree は深さ付きで前順に並べる", () => {
    const flat = flattenWbsTree(buildWbsTree([task("root", null), task("a", "root")]));
    expect(flat.map((n) => [n.task.id, n.depth])).toEqual([
      ["root", 0],
      ["a", 1],
    ]);
  });
});
