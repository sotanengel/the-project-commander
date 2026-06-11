import { describe, expect, it } from "vitest";
import {
  adaptSiblingInsertPlan,
  indentTaskPlans,
  moveTaskPlans,
  outdentTaskPlans,
  plansFromMoveResult,
} from "./wbsAdapter.js";

describe("wbsAdapter", () => {
  it("plansFromMoveResult は ok:false のとき null を返す", () => {
    expect(plansFromMoveResult({ ok: false, reason: "不可" })).toBeNull();
  });

  it("WbsTaskUpdate を TaskUpdatePlan に変換する", () => {
    expect(
      plansFromMoveResult({
        ok: true,
        updates: [{ taskId: "a", changes: { sortOrder: 1, parentId: "p" } }],
      }),
    ).toEqual([{ id: "a", input: { sortOrder: 1, parentId: "p" } }]);
  });

  it("moveTaskPlans は shared の moveTaskUp/Down 結果を変換する", () => {
    const tasks = [
      {
        id: "a",
        projectId: "p1",
        parentId: null,
        name: "a",
        description: "",
        durationDays: 1,
        progress: 0,
        assignee: "",
        sortOrder: 0,
      },
      {
        id: "b",
        projectId: "p1",
        parentId: null,
        name: "b",
        description: "",
        durationDays: 1,
        progress: 0,
        assignee: "",
        sortOrder: 1,
      },
    ];
    expect(moveTaskPlans(tasks, "a", "down")).toEqual(
      expect.arrayContaining([
        { id: "a", input: { sortOrder: 1 } },
        { id: "b", input: { sortOrder: 0 } },
      ]),
    );
    expect(moveTaskPlans(tasks, "a", "up")).toBeNull();
  });

  it("indentTaskPlans / outdentTaskPlans も同様に変換する", () => {
    const tasks = [
      {
        id: "root",
        projectId: "p1",
        parentId: null,
        name: "root",
        description: "",
        durationDays: 1,
        progress: 0,
        assignee: "",
        sortOrder: 0,
      },
      {
        id: "child",
        projectId: "p1",
        parentId: "root",
        name: "child",
        description: "",
        durationDays: 1,
        progress: 0,
        assignee: "",
        sortOrder: 0,
      },
    ];
    expect(indentTaskPlans(tasks, "child")).toBeNull();
    expect(outdentTaskPlans(tasks, "root")).toBeNull();
    expect(outdentTaskPlans(tasks, "child")).not.toBeNull();
  });

  it("adaptSiblingInsertPlan は bumps を変換する", () => {
    expect(
      adaptSiblingInsertPlan({
        parentId: "b",
        sortOrder: 1,
        bumps: [{ taskId: "b2", changes: { sortOrder: 2 } }],
      }),
    ).toEqual({
      parentId: "b",
      sortOrder: 1,
      bumps: [{ id: "b2", input: { sortOrder: 2 } }],
    });
    expect(adaptSiblingInsertPlan(null)).toBeNull();
  });
});
