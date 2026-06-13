import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { type Db, createDb } from "../db.js";

describe("リスクAPI", () => {
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
      payload: { name: "テストプロジェクト", description: "テスト概要", startDate: "2026-06-10" },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  describe("GET /api/projects/:projectId/risks", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/no-such-id/risks" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("リスクが無い場合は空配列を返す", async () => {
      const project = await createProject();
      const res = await app.inject({ method: "GET", url: `/api/projects/${project.id}/risks` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("作成済みのリスク一覧を返す", async () => {
      const project = await createProject();
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "要員不足" },
      });
      await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "仕様変更", probability: "high", impact: "high" },
      });
      const res = await app.inject({ method: "GET", url: `/api/projects/${project.id}/risks` });
      expect(res.statusCode).toBe(200);
      const risks = res.json();
      expect(risks).toHaveLength(2);
      expect(risks.map((r: { title: string }) => r.title)).toEqual(
        expect.arrayContaining(["要員不足", "仕様変更"]),
      );
    });
  });

  describe("POST /api/projects/:projectId/risks", () => {
    it("存在しないプロジェクトは404を返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/no-such-id/risks",
        payload: { title: "要員不足" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });

    it("デフォルト値込みでリスクを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "要員不足" },
      });
      expect(res.statusCode).toBe(201);
      const risk = res.json();
      expect(risk).toMatchObject({
        projectId: project.id,
        title: "要員不足",
        probability: "medium",
        impact: "medium",
        response: "",
        status: "open",
      });
      expect(typeof risk.id).toBe("string");
    });

    it("全フィールド指定でリスクを作成できる", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: {
          title: "ベンダー遅延",
          probability: "high",
          impact: "low",
          response: "代替ベンダーを確保する",
          status: "watching",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        title: "ベンダー遅延",
        probability: "high",
        impact: "low",
        response: "代替ベンダーを確保する",
        status: "watching",
      });
    });

    it("titleが空の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });

    it("probabilityがlow/medium/high以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "要員不足", probability: "extreme" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("impactがlow/medium/high以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "要員不足", impact: "huge" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("statusがopen/watching/closed以外の場合は400を返す", async () => {
      const project = await createProject();
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/risks`,
        payload: { title: "要員不足", status: "resolved" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /api/risks/:id", () => {
    it("部分更新ができる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/risks`,
          payload: { title: "要員不足" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/risks/${created.id}`,
        payload: { status: "closed", impact: "high" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: created.id,
        title: "要員不足",
        status: "closed",
        impact: "high",
        probability: "medium",
      });
    });

    it("存在しないリスクは404を返す", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/risks/no-such-id",
        payload: { status: "closed" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "リスクが見つかりません" });
    });

    it("不正な値での更新は400を返す", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/risks`,
          payload: { title: "要員不足" },
        })
      ).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/risks/${created.id}`,
        payload: { probability: "very-high" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/risks/:id", () => {
    it("リスクを削除できる", async () => {
      const project = await createProject();
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/risks`,
          payload: { title: "要員不足" },
        })
      ).json();
      const res = await app.inject({ method: "DELETE", url: `/api/risks/${created.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const list = (
        await app.inject({ method: "GET", url: `/api/projects/${project.id}/risks` })
      ).json();
      expect(list).toEqual([]);
    });

    it("存在しないリスクは404を返す", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/risks/no-such-id" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "リスクが見つかりません" });
    });
  });

  it("プロジェクト削除でリスクもカスケード削除される", async () => {
    const project = await createProject();
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/risks`,
      payload: { title: "要員不足" },
    });
    const del = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
    expect(del.statusCode).toBe(200);
    const rows = db.prepare("SELECT * FROM risks WHERE projectId = ?").all(project.id);
    expect(rows).toEqual([]);
  });
});
