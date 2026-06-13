import { describe, expect, it } from "vitest";
import {
  BulkBodySchema,
  BulkTaskSchema,
  ExportBundleSchema,
  TaskCommentCreateSchema,
  TaskCommentSchema,
} from "./types.js";

describe("BulkTaskSchema", () => {
  it("階層タスク入力を parse できる", () => {
    const parsed = BulkTaskSchema.parse({
      name: "Root",
      children: [{ name: "Child", durationDays: 2 }],
    });
    expect(parsed.children).toHaveLength(1);
  });

  it("空のタスク名は拒否する", () => {
    expect(() => BulkTaskSchema.parse({ name: "" })).toThrow();
  });

  it("BulkBodySchema は tasks 配列を要求する", () => {
    const body = BulkBodySchema.parse({
      tasks: [{ name: "A" }, { name: "B", children: [{ name: "B1" }] }],
    });
    expect(body.tasks).toHaveLength(2);
  });
});

describe("TaskCommentSchema", () => {
  it("有効なコメントを parse できる", () => {
    const parsed = TaskCommentSchema.parse({
      id: "c1",
      taskId: "t1",
      body: "設計レビュー完了",
      createdAt: "2026-06-13T05:30:00.000Z",
    });
    expect(parsed.body).toBe("設計レビュー完了");
  });

  it("空の body は拒否する", () => {
    expect(() =>
      TaskCommentSchema.parse({
        id: "c1",
        taskId: "t1",
        body: "",
        createdAt: "2026-06-13T05:30:00.000Z",
      }),
    ).toThrow();
  });
});

describe("TaskCommentCreateSchema", () => {
  it("trim 前後の空白を除いた body を受け付ける", () => {
    const parsed = TaskCommentCreateSchema.parse({ body: "  進捗50%  " });
    expect(parsed.body).toBe("進捗50%");
  });

  it("空白のみの body は拒否する", () => {
    expect(() => TaskCommentCreateSchema.parse({ body: "   " })).toThrow();
  });
});

describe("ExportBundleSchema", () => {
  it("taskComments 省略時は空配列として扱う", () => {
    const bundle = ExportBundleSchema.parse({
      version: 1,
      exportedAt: "2026-06-13T00:00:00.000Z",
      project: {
        id: "p1",
        name: "P",
        description: "",
        startDate: "2026-06-01",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      tasks: [],
      dependencies: [],
      milestones: [],
      risks: [],
      stakeholders: [],
    });
    expect(bundle.taskComments).toEqual([]);
  });
});
