import type { Dependency, ProjectPlan, Task } from "@tpc/shared";
import { describe, expect, it } from "vitest";
import {
  buildTaskBreadcrumb,
  buildTaskDetailView,
  formatAssignee,
  isLeafTask,
} from "./taskDetailModel.js";

const tasks: Task[] = [
  {
    id: "p1",
    projectId: "proj",
    parentId: null,
    name: "フェーズ1",
    description: "",
    durationDays: 0,
    progress: 0,
    assignee: "",
    sortOrder: 0,
  },
  {
    id: "t1",
    projectId: "proj",
    parentId: "p1",
    name: "タスクA",
    description: "作業内容A",
    durationDays: 3,
    progress: 50,
    assignee: "太郎",
    sortOrder: 0,
  },
  {
    id: "t2",
    projectId: "proj",
    parentId: "p1",
    name: "タスクB",
    description: "作業内容B",
    durationDays: 2,
    progress: 0,
    assignee: "",
    sortOrder: 1,
  },
];

const dependencies: Dependency[] = [
  {
    id: "d1",
    projectId: "proj",
    predecessorId: "t1",
    successorId: "t2",
    type: "FS",
    lagDays: 0,
  },
];

const plan: ProjectPlan = {
  project: {
    id: "proj",
    name: "テスト",
    description: "",
    startDate: "2027-04-01",
    createdAt: "2027-04-01T00:00:00.000Z",
  },
  tasks,
  dependencies,
  milestones: [],
  cpm: {
    projectDuration: 5,
    criticalPath: ["t1", "t2"],
    tasks: [
      {
        taskId: "t1",
        earlyStart: 0,
        earlyFinish: 3,
        lateStart: 0,
        lateFinish: 3,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: true,
      },
      {
        taskId: "t2",
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
};

describe("isLeafTask", () => {
  it("子を持たないタスクは葉", () => {
    expect(isLeafTask(tasks, "t1")).toBe(true);
    expect(isLeafTask(tasks, "p1")).toBe(false);
  });
});

describe("buildTaskBreadcrumb", () => {
  it("親を辿ってパンくずを構築する", () => {
    expect(buildTaskBreadcrumb(tasks, "t1")).toEqual(["フェーズ1", "タスクA"]);
    expect(buildTaskBreadcrumb(tasks, "p1")).toEqual(["フェーズ1"]);
  });
});

describe("buildTaskDetailView", () => {
  it("存在しないタスクは null", () => {
    expect(buildTaskDetailView(plan, "missing")).toBeNull();
  });

  it("タスク詳細ビューを組み立てる", () => {
    const view = buildTaskDetailView(plan, "t1");
    expect(view).not.toBeNull();
    expect(view?.task.name).toBe("タスクA");
    expect(view?.isLeaf).toBe(true);
    expect(view?.breadcrumb).toEqual(["フェーズ1", "タスクA"]);
    expect(view?.predecessors).toEqual([]);
    expect(view?.successors).toEqual([{ id: "t2", name: "タスクB" }]);
    expect(view?.startDateLabel).toBe("2027-04-01");
    expect(view?.finishDateLabel).toBe("2027-04-03");
    expect(view?.schedule?.isCritical).toBe(true);
  });

  it("親タスクは schedule が null でもビューを返す", () => {
    const view = buildTaskDetailView(plan, "p1");
    expect(view?.isLeaf).toBe(false);
    expect(view?.schedule).toBeNull();
    expect(view?.children).toEqual([
      { id: "t1", name: "タスクA" },
      { id: "t2", name: "タスクB" },
    ]);
  });
});

describe("formatAssignee", () => {
  it("空文字は未設定", () => {
    expect(formatAssignee("")).toBe("未設定");
    expect(formatAssignee("  ")).toBe("未設定");
  });

  it("値があればそのまま返す", () => {
    expect(formatAssignee("太郎")).toBe("太郎");
  });
});
