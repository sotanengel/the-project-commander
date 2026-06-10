import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { type Db, createDb } from "../db.js";

describe("マイルストーンAPI", () => {
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

  describe("GET /api/projects/:projectId/milestones", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/no-such-id/milestones" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("マイルストーンが無い場合は空配列を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/milestones`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("dueDate昇順でマイルストーン一覧を返す", async () => {
      const project = await createProject();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "リリース", dueDate: "2026-09-30" },
      });
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "設計完了", dueDate: "2026-07-15" },
      });
      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/milestones`,
      });
      expect(res.statusCode).toBe(200);
      const milestones = res.json();
      expect(milestones.map((m: { name: string }) => m.name)).toEqual(["設計完了", "リリース"]);
    });
  });

  describe("POST /api/projects/:projectId/milestones", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/no-such-id/milestones",
        payload: { name: "設計完了", dueDate: "2026-07-15" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("デフォルトstatus=pendingでマイルストーンを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "設計完了", dueDate: "2026-07-15" },
      });
      expect(res.statusCode).toBe(201);
      const milestone = res.json();
      expect(milestone).toMatchObject({
        projectId: project.id,
        name: "設計完了",
        dueDate: "2026-07-15",
        status: "pending",
      });
      expect(typeof milestone.id).toBe("string");
    });

    it("status指定でマイルストーンを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "キックオフ", dueDate: "2026-06-15", status: "done" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: "キックオフ", status: "done" });
    });

    it("nameが空の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "", dueDate: "2026-07-15" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });

    it("dueDateがYYYY-MM-DD形式でない場合は400を返す", async () => {
      const project = await createProject();
      for (const dueDate of ["2026/07/15", "07-15-2026", "20260715", "invalid"]) {
        const res = await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/milestones`,
          payload: { name: "設計完了", dueDate },
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it("dueDate未指定の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "設計完了" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("statusがpending/done以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/milestones`,
        payload: { name: "設計完了", dueDate: "2026-07-15", status: "cancelled" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /api/milestones/:id", () => {
    it("部分更新ができる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/milestones`,
          payload: { name: "設計完了", dueDate: "2026-07-15" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/milestones/${created.id}`,
        payload: { status: "done" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: created.id,
        name: "設計完了",
        dueDate: "2026-07-15",
        status: "done",
      });
    });

    it("存在しないマイルストーンは404を返す", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/milestones/no-such-id",
        payload: { status: "done" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "マイルストーンが見つかりません" });
    });

    it("不正なdueDateでの更新は400を返す", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/milestones`,
          payload: { name: "設計完了", dueDate: "2026-07-15" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/milestones/${created.id}`,
        payload: { dueDate: "7月15日" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/milestones/:id", () => {
    it("マイルストーンを削除できる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/milestones`,
          payload: { name: "設計完了", dueDate: "2026-07-15" },
        })
      ).json();
      const res = await app.inject({ method: "DELETE", url: `/api/milestones/${created.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const list = (
        await app.inject({ method: "GET", url: `/api/projects/${project.id}/milestones` })
      ).json();
      expect(list).toEqual([]);
    });

    it("存在しないマイルストーンは404を返す", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/milestones/no-such-id" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "マイルストーンが見つかりません" });
    });
  });

  it("プロジェクト削除でマイルストーンもカスケード削除される", async () => {
    const project = await createProject();
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/milestones`,
      payload: { name: "設計完了", dueDate: "2026-07-15" },
    });
    const del = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
    expect(del.statusCode).toBe(200);
    const rows = db.prepare("SELECT * FROM milestones WHERE projectId = ?").all(project.id);
    expect(rows).toEqual([]);
  });
});
