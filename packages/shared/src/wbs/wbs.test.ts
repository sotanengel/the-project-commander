import { describe, expect, it } from "vitest";
import type { Task } from "../types.js";
import {
  type WbsMoveResult,
  buildWbsTree,
  flattenWbsTree,
  indentTask,
  moveTaskDown,
  moveTaskUp,
  normalizeSortOrders,
  outdentTask,
  reparentTask,
  validateWbs,
} from "./index.js";

function task(
  id: string,
  parentId: string | null,
  durationDays = 1,
  progress = 0,
  sortOrder = 0,
): Task {
  return {
    id,
    projectId: "p1",
    parentId,
    name: id,
    description: "",
    durationDays,
    progress,
    assignee: "",
    sortOrder,
  };
}

/** ok:true を強制し、updates を取り出すテストヘルパー */
function updatesOf(result: WbsMoveResult): Array<{ taskId: string; changes: object }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.updates;
}

/** updates を tasks に適用した結果を返す（純粋関数の検証用） */
function applyUpdates(tasks: Task[], result: WbsMoveResult): Task[] {
  return tasks.map((t) => {
    const update = updatesOf(result).find((u) => u.taskId === t.id);
    return update ? { ...t, ...update.changes } : t;
  });
}

/** 同一親内のタスクIDをsortOrder順で返す */
function orderUnder(tasks: Task[], parentId: string | null): string[] {
  return tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => t.id);
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

  it("深い階層でもロールアップが各レベルで子の合計と一致する（100%ルール）", () => {
    // root > phase1 > (wp1: 3日/100%, wp2: 1日/0%), root > phase2 > sub > wp3: 4日/50%
    const tasks = [
      task("root", null, 999, 0, 0),
      task("phase1", "root", 999, 0, 0),
      task("wp1", "phase1", 3, 100, 0),
      task("wp2", "phase1", 1, 0, 1),
      task("phase2", "root", 999, 0, 1),
      task("sub", "phase2", 999, 0, 0),
      task("wp3", "sub", 4, 50, 0),
    ];
    const tree = buildWbsTree(tasks);
    const flat = flattenWbsTree(tree);
    const byId = new Map(flat.map((n) => [n.task.id, n]));

    // 葉は自身の値
    expect(byId.get("wp1")?.rollup).toEqual({
      durationDays: 3,
      progress: 100,
      workPackageCount: 1,
    });
    // サマリは子の合計（自身のdurationDaysは無視される）
    expect(byId.get("phase1")?.rollup.durationDays).toBe(4);
    expect(byId.get("phase1")?.rollup.progress).toBeCloseTo((100 * 3 + 0 * 1) / 4);
    expect(byId.get("phase1")?.rollup.workPackageCount).toBe(2);
    // 多段ネストでも子からの集約のみ
    expect(byId.get("sub")?.rollup.durationDays).toBe(4);
    expect(byId.get("phase2")?.rollup.durationDays).toBe(4);
    expect(byId.get("phase2")?.rollup.progress).toBeCloseTo(50);
    // ルートは全ワークパッケージの合計
    expect(byId.get("root")?.rollup.durationDays).toBe(8);
    expect(byId.get("root")?.rollup.workPackageCount).toBe(3);
    expect(byId.get("root")?.rollup.progress).toBeCloseTo((100 * 3 + 0 * 1 + 50 * 4) / 8);
  });

  it("所要日数が全て0のサマリは進捗0として扱う（ゼロ除算しない）", () => {
    const tree = buildWbsTree([task("root", null, 0), task("a", "root", 0, 100)]);
    expect(tree[0]?.rollup.progress).toBe(0);
    expect(tree[0]?.rollup.durationDays).toBe(0);
  });
});

describe("validateWbs", () => {
  it("正常なWBSでは valid=true / issues空", () => {
    const result = validateWbs([
      task("root", null, 1, 0, 0),
      task("a", "root", 1, 0, 0),
      task("b", "root", 1, 0, 1),
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("ID重複を検出する", () => {
    const result = validateWbs([task("a", null), task("a", null)]);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      type: "duplicateId",
      taskId: "a",
      message: "タスクID「a」が重複しています",
    });
  });

  it("存在しないparentIdを検出する", () => {
    const result = validateWbs([task("a", "ghost")]);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      type: "missingParent",
      taskId: "a",
      message: "タスク「a」の親タスク「ghost」が存在しません",
    });
  });

  it("親子関係の循環を検出する（自己参照を含む）", () => {
    const result = validateWbs([task("a", "b"), task("b", "a"), task("self", "self")]);
    expect(result.valid).toBe(false);
    const cycleIds = result.issues.filter((i) => i.type === "cycle").map((i) => i.taskId);
    expect(cycleIds).toContain("a");
    expect(cycleIds).toContain("b");
    expect(cycleIds).toContain("self");
    for (const issue of result.issues.filter((i) => i.type === "cycle")) {
      expect(issue.message).toContain("循環");
    }
  });

  it("循環に巻き込まれていないタスクは循環として報告しない", () => {
    const result = validateWbs([task("a", "b"), task("b", "a"), task("ok", null)]);
    const cycleIds = result.issues.filter((i) => i.type === "cycle").map((i) => i.taskId);
    expect(cycleIds).not.toContain("ok");
  });
});

describe("moveTaskUp / moveTaskDown", () => {
  const tasks = [
    task("root", null, 0, 0, 0),
    task("a", "root", 1, 0, 0),
    task("b", "root", 1, 0, 1),
    task("c", "root", 1, 0, 2),
  ];

  it("moveTaskUp は直前の兄弟と順序を入れ替える", () => {
    const result = moveTaskUp(tasks, "b");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "root")).toEqual(["b", "a", "c"]);
  });

  it("moveTaskDown は直後の兄弟と順序を入れ替える", () => {
    const result = moveTaskDown(tasks, "b");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "root")).toEqual(["a", "c", "b"]);
  });

  it("先頭タスクのmoveTaskUpは不可", () => {
    const result = moveTaskUp(tasks, "a");
    expect(result).toEqual({ ok: false, reason: "すでに先頭のため上へ移動できません" });
  });

  it("末尾タスクのmoveTaskDownは不可", () => {
    const result = moveTaskDown(tasks, "c");
    expect(result).toEqual({ ok: false, reason: "すでに末尾のため下へ移動できません" });
  });

  it("存在しないタスクは不可", () => {
    expect(moveTaskUp(tasks, "ghost")).toEqual({
      ok: false,
      reason: "タスク「ghost」が見つかりません",
    });
    expect(moveTaskDown(tasks, "ghost")).toEqual({
      ok: false,
      reason: "タスク「ghost」が見つかりません",
    });
  });

  it("sortOrderが乱れていても移動後に0,1,2...へ正規化する", () => {
    const messy = [task("a", null, 1, 0, 10), task("b", null, 1, 0, 25), task("c", null, 1, 0, 40)];
    const result = moveTaskDown(messy, "a");
    const after = applyUpdates(messy, result);
    expect(orderUnder(after, null)).toEqual(["b", "a", "c"]);
    expect(after.map((t) => t.sortOrder).sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it("変更不要なタスクの更新は含めない", () => {
    const result = moveTaskUp(tasks, "b");
    const ids = updatesOf(result).map((u) => u.taskId);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
});

describe("indentTask", () => {
  it("直前の兄弟の子（末尾）になり、両グループとも正規化される", () => {
    const tasks = [
      task("a", null, 1, 0, 0),
      task("a1", "a", 1, 0, 0),
      task("b", null, 1, 0, 1),
      task("c", null, 1, 0, 2),
    ];
    const result = indentTask(tasks, "b");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "a")).toEqual(["a1", "b"]);
    expect(orderUnder(after, null)).toEqual(["a", "c"]);
  });

  it("先頭の兄弟はインデント不可", () => {
    const tasks = [task("a", null, 1, 0, 0), task("b", null, 1, 0, 1)];
    expect(indentTask(tasks, "a")).toEqual({
      ok: false,
      reason: "直前の兄弟タスクがないためインデントできません",
    });
  });

  it("存在しないタスクは不可", () => {
    expect(indentTask([], "ghost")).toEqual({
      ok: false,
      reason: "タスク「ghost」が見つかりません",
    });
  });
});

describe("outdentTask", () => {
  it("親の直後の兄弟に昇格し、両グループとも正規化される", () => {
    const tasks = [
      task("root", null, 0, 0, 0),
      task("a", "root", 1, 0, 0),
      task("b", "root", 1, 0, 1),
      task("c", "root", 1, 0, 2),
      task("after", null, 1, 0, 1),
    ];
    const result = outdentTask(tasks, "b");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, null)).toEqual(["root", "b", "after"]);
    expect(orderUnder(after, "root")).toEqual(["a", "c"]);
  });

  it("ルートタスクはアウトデント不可", () => {
    expect(outdentTask([task("a", null)], "a")).toEqual({
      ok: false,
      reason: "ルート直下のタスクのためアウトデントできません",
    });
  });

  it("深い階層からのアウトデントは祖父母の子になる", () => {
    const tasks = [
      task("root", null, 0, 0, 0),
      task("mid", "root", 0, 0, 0),
      task("leaf", "mid", 1, 0, 0),
    ];
    const result = outdentTask(tasks, "leaf");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "root")).toEqual(["mid", "leaf"]);
    expect(orderUnder(after, "mid")).toEqual([]);
  });

  it("存在しないタスクは不可", () => {
    expect(outdentTask([], "ghost")).toEqual({
      ok: false,
      reason: "タスク「ghost」が見つかりません",
    });
  });
});

describe("reparentTask", () => {
  const tasks = [
    task("root", null, 0, 0, 0),
    task("a", "root", 1, 0, 0),
    task("a1", "a", 1, 0, 0),
    task("b", "root", 1, 0, 1),
    task("b1", "b", 1, 0, 0),
  ];

  it("任意の親の末尾へ移動し、移動元も正規化される", () => {
    const result = reparentTask(tasks, "a1", "b");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "b")).toEqual(["b1", "a1"]);
    expect(orderUnder(after, "a")).toEqual([]);
  });

  it("ルート（null）への移動もできる", () => {
    const result = reparentTask(tasks, "a1", null);
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, null)).toEqual(["root", "a1"]);
  });

  it("同一親内への移動は末尾への並べ替えになる", () => {
    const result = reparentTask(tasks, "a", "root");
    const after = applyUpdates(tasks, result);
    expect(orderUnder(after, "root")).toEqual(["b", "a"]);
  });

  it("自分自身の配下への移動は不可", () => {
    expect(reparentTask(tasks, "a", "a")).toEqual({
      ok: false,
      reason: "タスクを自分自身の配下へは移動できません",
    });
  });

  it("自分の子孫の配下への移動は不可", () => {
    expect(reparentTask(tasks, "a", "a1")).toEqual({
      ok: false,
      reason: "タスクを自分の子孫の配下へは移動できません",
    });
    // 深い子孫でも拒否される
    const deep = [...tasks, task("a1x", "a1", 1, 0, 0)];
    expect(reparentTask(deep, "a", "a1x")).toEqual({
      ok: false,
      reason: "タスクを自分の子孫の配下へは移動できません",
    });
  });

  it("存在しない移動先親は不可", () => {
    expect(reparentTask(tasks, "a", "ghost")).toEqual({
      ok: false,
      reason: "移動先の親タスク「ghost」が見つかりません",
    });
  });

  it("存在しないタスクは不可", () => {
    expect(reparentTask(tasks, "ghost", null)).toEqual({
      ok: false,
      reason: "タスク「ghost」が見つかりません",
    });
  });
});

describe("normalizeSortOrders", () => {
  it("全グループのsortOrderを0,1,2...へ正規化する更新を返す", () => {
    const tasks = [
      task("a", null, 1, 0, 5),
      task("b", null, 1, 0, 9),
      task("x", "a", 1, 0, 3),
      task("y", "a", 1, 0, 7),
    ];
    const updates = normalizeSortOrders(tasks);
    const after = tasks.map((t) => {
      const u = updates.find((p) => p.taskId === t.id);
      return u ? { ...t, ...u.changes } : t;
    });
    expect(orderUnder(after, null)).toEqual(["a", "b"]);
    expect(after.find((t) => t.id === "a")?.sortOrder).toBe(0);
    expect(after.find((t) => t.id === "b")?.sortOrder).toBe(1);
    expect(after.find((t) => t.id === "x")?.sortOrder).toBe(0);
    expect(after.find((t) => t.id === "y")?.sortOrder).toBe(1);
  });

  it("すでに正規化済みなら空の更新を返す", () => {
    const tasks = [task("a", null, 1, 0, 0), task("b", null, 1, 0, 1)];
    expect(normalizeSortOrders(tasks)).toEqual([]);
  });
});
