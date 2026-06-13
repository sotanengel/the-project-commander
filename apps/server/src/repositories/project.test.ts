import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";
import { loadProjectPlan, projectExists } from "./project.js";

describe("project repository", () => {
  it("projectExists は存在しない ID で false を返す", () => {
    const db = createDb(":memory:");
    expect(projectExists(db, "missing")).toBe(false);
  });

  it("loadProjectPlan は存在しないプロジェクトで null を返す", () => {
    const db = createDb(":memory:");
    expect(loadProjectPlan(db, "missing")).toBeNull();
  });

  it("loadProjectPlan はタスク・依存・マイルストーンと CPM を含む計画を返す", async () => {
    const db = createDb(":memory:");
    process.env.NODE_ENV = "test";
    const app = await buildApp(db);
    try {
      const create = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P", description: "テスト概要", startDate: "2025-01-01" },
      });
      const project = create.json();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/tasks`,
        payload: { name: "A", durationDays: 2 },
      });
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/tasks`,
        payload: { name: "B", durationDays: 3 },
      });
      const tasks = (
        await app.inject({ method: "GET", url: `/api/projects/${project.id}/tasks` })
      ).json();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/dependencies`,
        payload: { predecessorId: tasks[0].id, successorId: tasks[1].id, type: "FS", lagDays: 0 },
      });

      const plan = loadProjectPlan(db, project.id);
      expect(plan).not.toBeNull();
      expect(plan?.tasks).toHaveLength(2);
      expect(plan?.dependencies).toHaveLength(1);
      expect(plan?.cpm.projectDuration).toBeGreaterThan(0);
      expect(projectExists(db, project.id)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
