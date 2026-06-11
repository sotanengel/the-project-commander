import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { type Db, createDb } from "../db.js";

describe("ベースラインAPI", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    db = createDb(":memory:");
    app = await buildApp(db);
  });

  afterEach(async () => {
    await app.close();
  });

  async function createProject(): Promise<{ id: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "テストプロジェクト", startDate: "2026-06-10" },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function addTask(projectId: string, name: string, durationDays: number) {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks`,
      payload: { name, durationDays },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  describe("GET /api/projects/:projectId/baselines", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/no-such-id/baselines" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("ベースラインが無い場合は空配列を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/baselines`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("POST /api/projects/:projectId/baselines", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/no-such-id/baselines",
        payload: { label: "v1" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("現在の計画からベースラインを作成し一覧で取得できる", async () => {
      const project = await createProject();
      await addTask(project.id, "A", 2);
      await addTask(project.id, "B", 3);

      const createRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/baselines`,
        payload: { label: "承認版v1" },
      });
      expect(createRes.statusCode).toBe(201);
      const baseline = createRes.json();
      expect(baseline.label).toBe("承認版v1");
      expect(baseline.projectId).toBe(project.id);
      expect(baseline.projectDuration).toBeGreaterThan(0);
      expect(baseline.tasks.length).toBeGreaterThan(0);

      const listRes = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/baselines`,
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(baseline.id);
    });
  });

  describe("DELETE /api/baselines/:id", () => {
    it("存在しないベースラインは404を返す", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/baselines/no-such-id" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "ベースラインが見つかりません" });
    });

    it("ベースラインを削除できる", async () => {
      const project = await createProject();
      await addTask(project.id, "A", 1);
      const createRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/baselines`,
        payload: {},
      });
      const baseline = createRes.json();

      const delRes = await app.inject({ method: "DELETE", url: `/api/baselines/${baseline.id}` });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toEqual({ ok: true });

      const listRes = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/baselines`,
      });
      expect(listRes.json()).toEqual([]);
    });
  });
});
