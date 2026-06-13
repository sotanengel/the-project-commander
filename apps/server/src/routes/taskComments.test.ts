import type { TaskComment } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

describe("task comments API", () => {
  let app: FastifyInstance;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "コメントテスト", description: "テスト概要", startDate: "2026-06-10" },
    });
    projectId = projectRes.json().id;
    const taskRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks`,
      payload: { name: "タスクA" },
    });
    taskId = taskRes.json().id;
  });

  afterEach(async () => {
    await app.close();
  });

  async function listComments(id = taskId): Promise<TaskComment[]> {
    const res = await app.inject({ method: "GET", url: `/api/tasks/${id}/comments` });
    return res.json();
  }

  describe("GET /api/tasks/:taskId/comments", () => {
    it("コメント一覧を古い順で返す", async () => {
      await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "1件目" },
      });
      await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "2件目" },
      });
      const res = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/comments` });
      expect(res.statusCode).toBe(200);
      const comments = res.json() as TaskComment[];
      expect(comments).toHaveLength(2);
      expect(comments[0]?.body).toBe("1件目");
      expect(comments[1]?.body).toBe("2件目");
    });

    it("存在しない taskId は 404", async () => {
      const res = await app.inject({ method: "GET", url: "/api/tasks/no-such/comments" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/tasks/:taskId/comments", () => {
    it("コメントを追加して返す", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "  設計完了  " },
      });
      expect(res.statusCode).toBe(201);
      const created = res.json() as TaskComment;
      expect(created.taskId).toBe(taskId);
      expect(created.body).toBe("設計完了");
      expect(created.createdAt).toBeTruthy();
      expect(created.updatedAt).toBeNull();
      const comments = await listComments();
      expect(comments).toHaveLength(1);
    });

    it("空文字・空白のみは 400", async () => {
      const empty = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "" },
      });
      expect(empty.statusCode).toBe(400);
      const spaces = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "   " },
      });
      expect(spaces.statusCode).toBe(400);
    });

    it("存在しない taskId は 404", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/tasks/no-such/comments",
        payload: { body: "x" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("タスク削除時にコメントも CASCADE 削除される", async () => {
      await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/comments`,
        payload: { body: "消えるコメント" },
      });
      const del = await app.inject({ method: "DELETE", url: `/api/tasks/${taskId}` });
      expect(del.statusCode).toBe(200);
      const res = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/comments` });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PUT /api/task-comments/:id", () => {
    it("コメントを更新し updatedAt を設定する", async () => {
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/tasks/${taskId}/comments`,
          payload: { body: "初稿" },
        })
      ).json() as TaskComment;

      const res = await app.inject({
        method: "PUT",
        url: `/api/task-comments/${created.id}`,
        payload: { body: "  修正版  " },
      });
      expect(res.statusCode).toBe(200);
      const updated = res.json() as TaskComment;
      expect(updated.body).toBe("修正版");
      expect(updated.updatedAt).toBeTruthy();
      expect(new Date(updated.updatedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime(),
      );
    });

    it("空文字・空白のみは 400", async () => {
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/tasks/${taskId}/comments`,
          payload: { body: "x" },
        })
      ).json() as TaskComment;
      const res = await app.inject({
        method: "PUT",
        url: `/api/task-comments/${created.id}`,
        payload: { body: "   " },
      });
      expect(res.statusCode).toBe(400);
    });

    it("存在しない id は 404", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/task-comments/no-such",
        payload: { body: "x" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/task-comments/:id", () => {
    it("コメントを削除する", async () => {
      const created = (
        await app.inject({
          method: "POST",
          url: `/api/tasks/${taskId}/comments`,
          payload: { body: "削除対象" },
        })
      ).json() as TaskComment;

      const del = await app.inject({
        method: "DELETE",
        url: `/api/task-comments/${created.id}`,
      });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ ok: true });
      const comments = await listComments();
      expect(comments).toHaveLength(0);
    });

    it("存在しない id は 404", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/task-comments/no-such",
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
