import type { Task } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

describe("tasks API", () => {
  let app: FastifyInstance;
  let projectId: string;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "タスクテスト", description: "テスト概要", startDate: "2026-06-10" },
    });
    projectId = res.json().id;
  });

  afterEach(async () => {
    await app.close();
  });

  async function createTask(payload: Record<string, unknown>) {
    return app.inject({ method: "POST", url: `/api/projects/${projectId}/tasks`, payload });
  }

  async function listTasks(): Promise<Task[]> {
    const res = await app.inject({ method: "GET", url: `/api/projects/${projectId}/tasks` });
    return res.json();
  }

  describe("作成", () => {
    it("parentId付きで作成すると同一親内のsortOrderが採番される", async () => {
      const parent = (await createTask({ name: "親" })).json();
      const c1 = await createTask({ name: "子1", parentId: parent.id });
      const c2 = await createTask({ name: "子2", parentId: parent.id });
      expect(c1.statusCode).toBe(201);
      expect(c2.statusCode).toBe(201);
      expect(c1.json().sortOrder).toBe(0);
      expect(c2.json().sortOrder).toBe(1);
    });

    it("存在しないparentIdは400で日本語メッセージ", async () => {
      const res = await createTask({ name: "迷子", parentId: "no-such-task" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("親タスク");
    });

    it("別プロジェクトのタスクをparentIdに指定すると400", async () => {
      const other = (
        await app.inject({
          method: "POST",
          url: "/api/projects",
          payload: { name: "別PJ", description: "テスト概要", startDate: "2026-06-10" },
        })
      ).json();
      const otherTask = (
        await app.inject({
          method: "POST",
          url: `/api/projects/${other.id}/tasks`,
          payload: { name: "他所の親" },
        })
      ).json();
      const res = await createTask({ name: "越境", parentId: otherTask.id });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("親タスク");
    });

    it("存在しないプロジェクトへの作成・一覧は404", async () => {
      const post = await app.inject({
        method: "POST",
        url: "/api/projects/nope/tasks",
        payload: { name: "x" },
      });
      expect(post.statusCode).toBe(404);
      const get = await app.inject({ method: "GET", url: "/api/projects/nope/tasks" });
      expect(get.statusCode).toBe(404);
    });

    it("空のnameは400（Zodバリデーション）", async () => {
      const res = await createTask({ name: "" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("入力が不正です");
    });
  });

  describe("更新", () => {
    it("parentIdを実在する親に変更できる", async () => {
      const a = (await createTask({ name: "A" })).json();
      const b = (await createTask({ name: "B" })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${b.id}`,
        payload: { parentId: a.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().parentId).toBe(a.id);
    });

    it("parentIdをnullに戻せる", async () => {
      const a = (await createTask({ name: "A" })).json();
      const b = (await createTask({ name: "B", parentId: a.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${b.id}`,
        payload: { parentId: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().parentId).toBeNull();
    });

    it("存在しないparentIdへの変更は400", async () => {
      const a = (await createTask({ name: "A" })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${a.id}`,
        payload: { parentId: "no-such-task" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("親タスク");
    });

    it("自分自身を親にする変更は400で日本語メッセージ", async () => {
      const a = (await createTask({ name: "A" })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${a.id}`,
        payload: { parentId: a.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("循環");
    });

    it("自分の子孫を親にする変更（親子循環）は400", async () => {
      const a = (await createTask({ name: "A" })).json();
      const b = (await createTask({ name: "B", parentId: a.id })).json();
      const c = (await createTask({ name: "C", parentId: b.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${a.id}`,
        payload: { parentId: c.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("循環");
    });

    it("存在しないタスクの更新は404", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/tasks/nope",
        payload: { name: "x" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "タスクが見つかりません" });
    });

    it("progressが範囲外（>100）は400", async () => {
      const a = (await createTask({ name: "A" })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/tasks/${a.id}`,
        payload: { progress: 150 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("削除", () => {
    it("削除すると子孫タスクと関連依存がカスケード削除される", async () => {
      const parent = (await createTask({ name: "親" })).json();
      const child = (await createTask({ name: "子", parentId: parent.id })).json();
      const grandchild = (await createTask({ name: "孫", parentId: child.id })).json();
      const outsider = (await createTask({ name: "無関係" })).json();
      const depRes = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/dependencies`,
        payload: { predecessorId: grandchild.id, successorId: outsider.id },
      });
      expect(depRes.statusCode).toBe(201);

      const delRes = await app.inject({ method: "DELETE", url: `/api/tasks/${parent.id}` });
      expect(delRes.statusCode).toBe(200);

      const remaining = await listTasks();
      expect(remaining.map((t) => t.id)).toEqual([outsider.id]);

      const deps = (
        await app.inject({ method: "GET", url: `/api/projects/${projectId}/dependencies` })
      ).json();
      expect(deps).toEqual([]);
    });

    it("存在しないタスクの削除は404", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/tasks/nope" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "タスクが見つかりません" });
    });
  });

  describe("一括登録（bulk）", () => {
    it("階層構造を一括登録するとparentIdとsortOrderが設定される", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/tasks/bulk`,
        payload: {
          tasks: [
            {
              name: "フェーズ1",
              children: [
                { name: "設計", durationDays: 2 },
                { name: "実装", durationDays: 5, children: [{ name: "API実装" }] },
              ],
            },
            { name: "フェーズ2" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const created: Task[] = res.json();
      expect(created).toHaveLength(5);
      const byName = new Map(created.map((t) => [t.name, t]));
      const phase1 = byName.get("フェーズ1") as Task;
      const phase2 = byName.get("フェーズ2") as Task;
      const design = byName.get("設計") as Task;
      const impl = byName.get("実装") as Task;
      const api = byName.get("API実装") as Task;
      expect(phase1.parentId).toBeNull();
      expect(phase2.parentId).toBeNull();
      expect(design.parentId).toBe(phase1.id);
      expect(impl.parentId).toBe(phase1.id);
      expect(api.parentId).toBe(impl.id);
      expect(phase1.sortOrder).toBe(0);
      expect(phase2.sortOrder).toBe(1);
      expect(design.sortOrder).toBe(0);
      expect(impl.sortOrder).toBe(1);
      expect(impl.durationDays).toBe(5);
    });

    it("既存タスクがある場合はルートのsortOrderが続きから採番される", async () => {
      await createTask({ name: "既存" });
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/tasks/bulk`,
        payload: { tasks: [{ name: "追加" }] },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()[0].sortOrder).toBe(1);
    });

    it("バリデーションエラー（子の空name）は400で何も登録されない", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/tasks/bulk`,
        payload: { tasks: [{ name: "親", children: [{ name: "" }] }] },
      });
      expect(res.statusCode).toBe(400);
      expect(await listTasks()).toEqual([]);
    });

    it("tasks配列が無いbodyは400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/tasks/bulk`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("存在しないプロジェクトへのbulkは404", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/nope/tasks/bulk",
        payload: { tasks: [{ name: "x" }] },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
