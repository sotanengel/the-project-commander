import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

describe("dependencies API", () => {
  let app: FastifyInstance;
  let projectId: string;
  let taskA: { id: string };
  let taskB: { id: string };
  let taskC: { id: string };

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "依存テスト", description: "テスト概要", startDate: "2026-06-10" },
    });
    projectId = res.json().id;
    [taskA, taskB, taskC] = (
      await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/tasks/bulk`,
        payload: { tasks: [{ name: "A" }, { name: "B" }, { name: "C" }] },
      })
    ).json();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createDep(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/dependencies`,
      payload,
    });
  }

  describe("作成", () => {
    it("依存関係を作成でき、デフォルトはFS/lag0", async () => {
      const res = await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        predecessorId: taskA.id,
        successorId: taskB.id,
        type: "FS",
        lagDays: 0,
        projectId,
      });
    });

    it("重複依存（同じpred/succ/type）は409で日本語メッセージ", async () => {
      await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      const res = await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain("既に存在");
    });

    it("同じpred/succでもtypeが異なれば作成できる", async () => {
      await createDep({ predecessorId: taskA.id, successorId: taskB.id, type: "FS" });
      const res = await createDep({ predecessorId: taskA.id, successorId: taskB.id, type: "SS" });
      expect(res.statusCode).toBe(201);
    });

    it("自己依存は400で日本語メッセージ", async () => {
      const res = await createDep({ predecessorId: taskA.id, successorId: taskA.id });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "自分自身への依存は設定できません" });
    });

    it("存在しないタスクを指定すると404", async () => {
      const res1 = await createDep({ predecessorId: "nope", successorId: taskB.id });
      expect(res1.statusCode).toBe(404);
      const res2 = await createDep({ predecessorId: taskA.id, successorId: "nope" });
      expect(res2.statusCode).toBe(404);
    });

    it("循環する依存は409", async () => {
      await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      await createDep({ predecessorId: taskB.id, successorId: taskC.id });
      const res = await createDep({ predecessorId: taskC.id, successorId: taskA.id });
      expect(res.statusCode).toBe(409);
      // 失敗した依存は登録されていない
      const deps = (
        await app.inject({ method: "GET", url: `/api/projects/${projectId}/dependencies` })
      ).json();
      expect(deps).toHaveLength(2);
    });

    it("不正なtypeは400", async () => {
      const res = await createDep({
        predecessorId: taskA.id,
        successorId: taskB.id,
        type: "XX",
      });
      expect(res.statusCode).toBe(400);
    });

    it("存在しないプロジェクトへの作成は404", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/nope/dependencies",
        payload: { predecessorId: taskA.id, successorId: taskB.id },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("更新", () => {
    it("type/lagDaysを更新できる", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { type: "SS", lagDays: -2 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: dep.id, type: "SS", lagDays: -2 });
    });

    it("不正なtype・lagDaysは400", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      for (const payload of [{ type: "INVALID" }, { lagDays: "abc" }]) {
        const res = await app.inject({
          method: "PUT",
          url: `/api/dependencies/${dep.id}`,
          payload,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("入力が不正です");
      }
    });

    it("更新で循環が生じる場合は409", async () => {
      await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskC.id })).json();
      // dep を B→A に変えると A→B→A の循環になる
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { predecessorId: taskB.id, successorId: taskA.id },
      });
      expect(res.statusCode).toBe(409);
    });

    it("更新で自己依存になる場合は400", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { successorId: taskA.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "自分自身への依存は設定できません" });
    });

    it("更新で既存の依存と重複する場合は409", async () => {
      await createDep({ predecessorId: taskA.id, successorId: taskB.id });
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskC.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { successorId: taskB.id },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain("既に存在");
    });

    it("内容を変えない更新は重複扱いにならない", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { lagDays: 3 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().lagDays).toBe(3);
    });

    it("更新で存在しないタスクを指定すると404", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      const res = await app.inject({
        method: "PUT",
        url: `/api/dependencies/${dep.id}`,
        payload: { successorId: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("存在しない依存関係の更新は404", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/dependencies/nope",
        payload: { lagDays: 1 },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "依存関係が見つかりません" });
    });
  });

  describe("削除・一覧", () => {
    it("削除でき、存在しないIDは404", async () => {
      const dep = (await createDep({ predecessorId: taskA.id, successorId: taskB.id })).json();
      const ok = await app.inject({ method: "DELETE", url: `/api/dependencies/${dep.id}` });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ ok: true });
      const ng = await app.inject({ method: "DELETE", url: `/api/dependencies/${dep.id}` });
      expect(ng.statusCode).toBe(404);
      expect(ng.json()).toEqual({ error: "依存関係が見つかりません" });
    });

    it("存在しないプロジェクトの一覧は404", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/nope/dependencies" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "プロジェクトが見つかりません" });
    });
  });
});
