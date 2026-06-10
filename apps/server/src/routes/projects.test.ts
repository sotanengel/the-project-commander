import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

async function createProject(app: FastifyInstance, name = "テストPJ") {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name, startDate: "2026-06-10" },
  });
  return res.json();
}

describe("projects API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
  });

  afterEach(async () => {
    await app.close();
  });

  describe("CRUD", () => {
    it("作成したプロジェクトが一覧と単体取得で返る", async () => {
      const project = await createProject(app, "一覧テスト");
      const listRes = await app.inject({ method: "GET", url: "/api/projects" });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().map((p: { id: string }) => p.id)).toContain(project.id);

      const getRes = await app.inject({ method: "GET", url: `/api/projects/${project.id}` });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toMatchObject({ id: project.id, name: "一覧テスト" });
    });

    it("PUTでプロジェクトを部分更新できる", async () => {
      const project = await createProject(app);
      const res = await app.inject({
        method: "PUT",
        url: `/api/projects/${project.id}`,
        payload: { name: "改名後" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: project.id,
        name: "改名後",
        startDate: project.startDate,
      });
    });

    it("PUTの不正な入力（空のname・不正な日付）は400", async () => {
      const project = await createProject(app);
      for (const payload of [{ name: "" }, { startDate: "2026/06/10" }]) {
        const res = await app.inject({
          method: "PUT",
          url: `/api/projects/${project.id}`,
          payload,
        });
        expect(res.statusCode).toBe(400);
        expect(typeof res.json().error).toBe("string");
      }
    });

    it("DELETEでプロジェクトが消え、配下のタスク・依存関係もカスケード削除される", async () => {
      const project = await createProject(app);
      const [a, b] = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/tasks/bulk`,
          payload: { tasks: [{ name: "A" }, { name: "B" }] },
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/dependencies`,
        payload: { predecessorId: a.id, successorId: b.id },
      });

      const delRes = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toEqual({ ok: true });

      const getRes = await app.inject({ method: "GET", url: `/api/projects/${project.id}` });
      expect(getRes.statusCode).toBe(404);
      // タスクは消えている（タスク更新は404になる）
      const taskRes = await app.inject({
        method: "PUT",
        url: `/api/tasks/${a.id}`,
        payload: { name: "x" },
      });
      expect(taskRes.statusCode).toBe(404);
    });
  });

  describe("404系", () => {
    it("存在しないプロジェクトのGET/PUT/DELETE/planは404で{error}形式", async () => {
      const cases = [
        { method: "GET" as const, url: "/api/projects/nope" },
        { method: "PUT" as const, url: "/api/projects/nope", payload: { name: "x" } },
        { method: "DELETE" as const, url: "/api/projects/nope" },
        { method: "GET" as const, url: "/api/projects/nope/plan" },
      ];
      for (const c of cases) {
        const res = await app.inject(c);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
      }
    });
  });

  describe("plan", () => {
    it("planがproject/tasks/dependencies/milestones/cpmを返す", async () => {
      const project = await createProject(app);
      const [design, impl] = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/tasks/bulk`,
          payload: {
            tasks: [
              { name: "設計", durationDays: 2 },
              { name: "実装", durationDays: 3 },
            ],
          },
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/dependencies`,
        payload: { predecessorId: design.id, successorId: impl.id },
      });

      const res = await app.inject({ method: "GET", url: `/api/projects/${project.id}/plan` });
      expect(res.statusCode).toBe(200);
      const plan = res.json();
      expect(plan.project.id).toBe(project.id);
      expect(plan.tasks).toHaveLength(2);
      expect(plan.dependencies).toHaveLength(1);
      expect(plan.milestones).toEqual([]);
      expect(plan.cpm.projectDuration).toBe(5);
      expect(plan.cpm.criticalPath).toEqual([design.id, impl.id]);
    });

    it("タスクが無い空プロジェクトでもplanが返る", async () => {
      const project = await createProject(app);
      const res = await app.inject({ method: "GET", url: `/api/projects/${project.id}/plan` });
      expect(res.statusCode).toBe(200);
      expect(res.json().cpm.projectDuration).toBe(0);
    });
  });
});
