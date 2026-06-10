import type { Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  countDescendants,
  indentTask,
  insertSiblingPlan,
  moveTask,
  outdentTask,
} from "./wbsOps.js";

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

// ルート: a(0), b(1), c(2) / bの子: b1(0), b2(1)
function fixture(): Task[] {
  return [
    task({ id: "a", sortOrder: 0 }),
    task({ id: "b", sortOrder: 1 }),
    task({ id: "c", sortOrder: 2 }),
    task({ id: "b1", parentId: "b", sortOrder: 0 }),
    task({ id: "b2", parentId: "b", sortOrder: 1 }),
  ];
}

describe("moveTask", () => {
  it("先頭タスクは上に移動できない", () => {
    expect(moveTask(fixture(), "a", "up")).toBeNull();
  });

  it("末尾タスクは下に移動できない", () => {
    expect(moveTask(fixture(), "c", "down")).toBeNull();
  });

  it("存在しないタスクはnull", () => {
    expect(moveTask(fixture(), "zzz", "up")).toBeNull();
  });

  it("下に移動すると直後の兄弟とsortOrderを入れ替える（2件の更新）", () => {
    const updates = moveTask(fixture(), "a", "down");
    expect(updates).toEqual([
      { id: "a", input: { sortOrder: 1 } },
      { id: "b", input: { sortOrder: 0 } },
    ]);
  });

  it("上に移動すると直前の兄弟とsortOrderを入れ替える", () => {
    const updates = moveTask(fixture(), "b2", "up");
    expect(updates).toEqual([
      { id: "b1", input: { sortOrder: 1 } },
      { id: "b2", input: { sortOrder: 0 } },
    ]);
  });

  it("同一親内の兄弟だけを対象にする（子の有無は無関係）", () => {
    // b1はルートのa/b/cとは別グループなので、ルート側に影響しない
    const updates = moveTask(fixture(), "b1", "down");
    expect(updates).toEqual([
      { id: "b1", input: { sortOrder: 1 } },
      { id: "b2", input: { sortOrder: 0 } },
    ]);
  });

  it("sortOrderが重複していても正規化して並べ替える", () => {
    const tasks = [
      task({ id: "x", sortOrder: 0 }),
      task({ id: "y", sortOrder: 0 }),
      task({ id: "z", sortOrder: 0 }),
    ];
    // 配列順 x, y, z が表示順。yを上へ → y, x, z
    const updates = moveTask(tasks, "y", "up");
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "y", input: { sortOrder: 0 } },
        { id: "x", input: { sortOrder: 1 } },
        { id: "z", input: { sortOrder: 2 } },
      ]),
    );
  });
});

describe("indentTask", () => {
  it("直前の兄弟がいない場合はnull", () => {
    expect(indentTask(fixture(), "a")).toBeNull();
    expect(indentTask(fixture(), "b1")).toBeNull();
  });

  it("直前の兄弟の子（末尾）になる", () => {
    const updates = indentTask(fixture(), "c");
    // cはbの子になり、既存の子 b1(0), b2(1) の後ろに付く
    expect(updates).toEqual([{ id: "c", input: { parentId: "b", sortOrder: 2 } }]);
  });

  it("直前の兄弟に子がいなければ先頭の子になる", () => {
    const updates = indentTask(fixture(), "b");
    expect(updates).toEqual([{ id: "b", input: { parentId: "a", sortOrder: 0 } }]);
  });
});

describe("outdentTask", () => {
  it("ルートタスクはアウトデントできない", () => {
    expect(outdentTask(fixture(), "a")).toBeNull();
  });

  it("親の直後の位置で親の階層に移動し、後続の兄弟を繰り下げる", () => {
    const updates = outdentTask(fixture(), "b1");
    // b1はルートのb(1)の直後 = sortOrder 2 に入り、c(2)は3へ繰り下げ
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "b1", input: { parentId: null, sortOrder: 2 } },
        { id: "c", input: { sortOrder: 3 } },
      ]),
    );
    expect(updates).toHaveLength(2);
  });

  it("親が末尾なら繰り下げ更新は発生しない", () => {
    const tasks = [
      task({ id: "p", sortOrder: 0 }),
      task({ id: "p1", parentId: "p", sortOrder: 0 }),
    ];
    const updates = outdentTask(tasks, "p1");
    expect(updates).toEqual([{ id: "p1", input: { parentId: null, sortOrder: 1 } }]);
  });
});

describe("insertSiblingPlan", () => {
  it("対象の直下に挿入する位置を返し、後続の兄弟を繰り下げる", () => {
    const plan = insertSiblingPlan(fixture(), "a");
    expect(plan).not.toBeNull();
    expect(plan?.parentId).toBeNull();
    expect(plan?.sortOrder).toBe(1);
    expect(plan?.bumps).toEqual(
      expect.arrayContaining([
        { id: "b", input: { sortOrder: 2 } },
        { id: "c", input: { sortOrder: 3 } },
      ]),
    );
  });

  it("末尾タスクの直下なら繰り下げは不要", () => {
    const plan = insertSiblingPlan(fixture(), "c");
    expect(plan).toEqual({ parentId: null, sortOrder: 3, bumps: [] });
  });

  it("子階層でも同様に動く", () => {
    const plan = insertSiblingPlan(fixture(), "b1");
    expect(plan).toEqual({
      parentId: "b",
      sortOrder: 1,
      bumps: [{ id: "b2", input: { sortOrder: 2 } }],
    });
  });

  it("存在しないタスクはnull", () => {
    expect(insertSiblingPlan(fixture(), "zzz")).toBeNull();
  });
});

describe("countDescendants", () => {
  it("子孫の数を数える", () => {
    expect(countDescendants(fixture(), "b")).toBe(2);
    expect(countDescendants(fixture(), "a")).toBe(0);
  });

  it("孫も数える", () => {
    const tasks = [...fixture(), task({ id: "b1x", parentId: "b1", sortOrder: 0 })];
    expect(countDescendants(tasks, "b")).toBe(3);
  });
});
