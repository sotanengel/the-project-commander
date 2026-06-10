import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { type Db, createDb } from "../db.js";

describe("ステークホルダーAPI", () => {
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

  describe("GET /api/projects/:projectId/stakeholders", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/no-such-id/stakeholders",
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("ステークホルダーが無い場合は空配列を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/stakeholders`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("作成済みのステークホルダー一覧を返す", async () => {
      const project = await createProject();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "山田太郎" },
      });
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "佐藤花子", role: "スポンサー", influence: "high" },
      });
      const res = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/stakeholders`,
      });
      expect(res.statusCode).toBe(200);
      const stakeholders = res.json();
      expect(stakeholders).toHaveLength(2);
      expect(stakeholders.map((s: { name: string }) => s.name)).toEqual(
        expect.arrayContaining(["山田太郎", "佐藤花子"]),
      );
    });
  });

  describe("POST /api/projects/:projectId/stakeholders", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/no-such-id/stakeholders",
        payload: { name: "山田太郎" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("デフォルト値込みでステークホルダーを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "山田太郎" },
      });
      expect(res.statusCode).toBe(201);
      const stakeholder = res.json();
      expect(stakeholder).toMatchObject({
        projectId: project.id,
        name: "山田太郎",
        role: "",
        influence: "medium",
        interest: "medium",
        note: "",
      });
      expect(typeof stakeholder.id).toBe("string");
    });

    it("全フィールド指定でステークホルダーを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: {
          name: "佐藤花子",
          role: "スポンサー",
          influence: "high",
          interest: "low",
          note: "月次で報告する",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: "佐藤花子",
        role: "スポンサー",
        influence: "high",
        interest: "low",
        note: "月次で報告する",
      });
    });

    it("nameが空の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });

    it("influenceがlow/medium/high以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "山田太郎", influence: "supreme" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("interestがlow/medium/high以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/stakeholders`,
        payload: { name: "山田太郎", interest: "none" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /api/stakeholders/:id", () => {
    it("部分更新ができる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/stakeholders`,
          payload: { name: "山田太郎" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/stakeholders/${created.id}`,
        payload: { role: "PM", influence: "high" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: created.id,
        name: "山田太郎",
        role: "PM",
        influence: "high",
        interest: "medium",
      });
    });

    it("存在しないステークホルダーは404を返す", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/stakeholders/no-such-id",
        payload: { role: "PM" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "ステークホルダーが見つかりません" });
    });

    it("不正な値での更新は400を返す", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/stakeholders`,
          payload: { name: "山田太郎" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/stakeholders/${created.id}`,
        payload: { interest: "maximum" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/stakeholders/:id", () => {
    it("ステークホルダーを削除できる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/stakeholders`,
          payload: { name: "山田太郎" },
        })
      ).json();
      const res = await app.inject({ method: "DELETE", url: `/api/stakeholders/${created.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const list = (
        await app.inject({ method: "GET", url: `/api/projects/${project.id}/stakeholders` })
      ).json();
      expect(list).toEqual([]);
    });

    it("存在しないステークホルダーは404を返す", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/stakeholders/no-such-id" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "ステークホルダーが見つかりません" });
    });
  });

  it("プロジェクト削除でステークホルダーもカスケード削除される", async () => {
    const project = await createProject();
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/stakeholders`,
      payload: { name: "山田太郎" },
    });
    const del = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
    expect(del.statusCode).toBe(200);
    const rows = db.prepare("SELECT * FROM stakeholders WHERE projectId = ?").all(project.id);
    expect(rows).toEqual([]);
  });
});
