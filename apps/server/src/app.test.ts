import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createDb } from "./db.js";

describe("API smoke", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
  });

  afterEach(async () => {
    await app.close();
  });

  it("ヘルスチェックが応答する", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("プロジェクト作成→タスク一括登録→依存設定→plan取得でCPMが返る", async () => {
    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "テスト", startDate: "2026-06-10" },
    });
    expect(projectRes.statusCode).toBe(201);
    const project = projectRes.json();

    const bulkRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/tasks/bulk`,
      payload: {
        tasks: [
          { name: "設計", durationDays: 3 },
          { name: "実装", durationDays: 5 },
        ],
      },
    });
    expect(bulkRes.statusCode).toBe(201);
    const [design, impl] = bulkRes.json();

    const depRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/dependencies`,
      payload: { predecessorId: design.id, successorId: impl.id },
    });
    expect(depRes.statusCode).toBe(201);

    const planRes = await app.inject({ method: "GET", url: `/api/projects/${project.id}/plan` });
    expect(planRes.statusCode).toBe(200);
    const plan = planRes.json();
    expect(plan.cpm.projectDuration).toBe(8);
    expect(plan.cpm.criticalPath).toEqual([design.id, impl.id]);
  });

  it("循環依存は409で拒否される", async () => {
    const project = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "循環", startDate: "2026-06-10" },
      })
    ).json();
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
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/dependencies`,
      payload: { predecessorId: b.id, successorId: a.id },
    });
    expect(res.statusCode).toBe(409);
  });

  it("不正な入力は400で拒否される", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "", startDate: "invalid" },
    });
    expect(res.statusCode).toBe(400);
  });
});
