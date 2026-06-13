import type { CommentSuggestion } from "@tpc/shared";
import { describe, expect, it, vi } from "vitest";
import { applySuggestion, describeSuggestionChanges } from "./commentSuggestionModel.js";

describe("describeSuggestionChanges", () => {
  it("update_task の changes を列挙する", () => {
    const suggestion: CommentSuggestion = {
      id: "s1",
      kind: "update_task",
      label: "進捗",
      rationale: "理由",
      taskId: "t1",
      changes: { progress: 50, assignee: "Bob" },
    };
    expect(describeSuggestionChanges(suggestion)).toEqual(["progress: 50", "assignee: Bob"]);
  });
});

describe("applySuggestion", () => {
  it("update_task で updateTask を呼ぶ", async () => {
    const updateTask = vi.fn(async () => ({}) as never);
    const suggestion: CommentSuggestion = {
      id: "s1",
      kind: "update_task",
      label: "進捗",
      rationale: "理由",
      taskId: "t1",
      changes: { progress: 80 },
    };
    await applySuggestion(suggestion, "proj-1", {
      updateTask,
      createDependency: vi.fn(),
      updateMilestone: vi.fn(),
    });
    expect(updateTask).toHaveBeenCalledWith("t1", { progress: 80 });
  });

  it("create_dependency で createDependency を呼ぶ", async () => {
    const createDependency = vi.fn(async () => ({}) as never);
    const suggestion: CommentSuggestion = {
      id: "d1",
      kind: "create_dependency",
      label: "依存",
      rationale: "理由",
      dependency: { predecessorId: "a", successorId: "b", type: "FS" },
    };
    await applySuggestion(suggestion, "proj-1", {
      updateTask: vi.fn(),
      createDependency,
      updateMilestone: vi.fn(),
    });
    expect(createDependency).toHaveBeenCalledWith("proj-1", {
      predecessorId: "a",
      successorId: "b",
      type: "FS",
    });
  });
});
