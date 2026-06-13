import { describe, expect, it, vi } from "vitest";
import { createDb } from "../db.js";
import { analyzeComment } from "./analyzeComment.js";
import type { LlmProvider } from "./types.js";

function mockProvider(response: string): LlmProvider {
  return {
    providerId: "ollama",
    model: "test-model",
    checkHealth: vi.fn(async () => ({
      provider: "ollama" as const,
      ready: true,
      model: "test-model",
    })),
    complete: vi.fn(async () => response),
  };
}

describe("analyzeComment", () => {
  it("LLM 応答をパースして提案を返す", async () => {
    const db = createDb(":memory:");
    const projectRes = db
      .prepare(
        "INSERT INTO projects (id, name, description, startDate, createdAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run("proj-1", "P", "D", "2026-06-01", "2026-06-01T00:00:00.000Z");
    void projectRes;
    const taskId = "task-1";
    db.prepare(
      "INSERT INTO tasks (id, projectId, parentId, name, description, durationDays, progress, assignee, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(taskId, "proj-1", null, "設計", "", 5, 30, "", 0);

    const response = JSON.stringify({
      suggestions: [
        {
          id: "s1",
          kind: "update_task",
          label: "進捗50%",
          rationale: "コメントに基づく",
          taskId,
          changes: { progress: 50 },
        },
      ],
    });

    const result = await analyzeComment(db, mockProvider(response), {
      projectId: "proj-1",
      taskId,
      commentBody: "半分完了",
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.kind).toBe("update_task");
  });
});
