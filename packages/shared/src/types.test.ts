import { describe, expect, it } from "vitest";
import { BulkBodySchema, BulkTaskSchema } from "./types.js";

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
