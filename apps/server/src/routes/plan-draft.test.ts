import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

async function createProject(app: FastifyInstance, name = "テストPJ") {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name, description: "テスト概要", startDate: "2026-06-10" },
  });
  return res.json() as { id: string };
}

const fullDraft = {
  tasks: [
    {
      name: "企画",
      durationDays: 0,
      children: [
        { name: "要件定義", durationDays: 3, description: "要件整理" },
        { name: "構成設計", durationDays: 2, description: "構成案" },
      ],
    },
    {
      name: "実装",
      durationDays: 0,
      children: [{ name: "コーディング", durationDays: 5, description: "実装" }],
    },
  ],
  dependencies: [
    { predecessorName: "要件定義", successorName: "構成設計", type: "FS" },
    { predecessorName: "構成設計", successorName: "コーディング", type: "FS" },
  ],
  milestones: [{ name: "リリース", dueDate: "2026-07-01", status: "pending" }],
  risks: [
    {
      title: "遅延リスク",
      probability: "medium",
      impact: "high",
      response: "軽減: バッファ確保",
    },
  ],
  stakeholders: [
    { name: "山田", role: "スポンサー", influence: "high", interest: "high", note: "週次報告" },
  ],
};

describe("plan-draft-import API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
  });

  afterEach(async () => {
    await app.close();
  });

  it("フル計画を一括取り込みできる", async () => {
    const project = await createProject(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/plan-draft-import`,
      payload: fullDraft,
    });
    expect(res.statusCode).toBe(201);
    const summary = res.json();
    expect(summary.tasksCreated).toBe(5);
    expect(summary.dependencies.succeeded).toBe(2);
    expect(summary.milestones).toBe(1);
    expect(summary.risks).toBe(1);
    expect(summary.stakeholders).toBe(1);

    const planRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/plan`,
    });
    const plan = planRes.json();
    expect(plan.tasks).toHaveLength(5);
    expect(plan.dependencies).toHaveLength(2);
    expect(plan.milestones).toHaveLength(1);
  });

  it("存在しないタスク名の依存はスキップしてサマリに記録する", async () => {
    const project = await createProject(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/plan-draft-import`,
      payload: {
        ...fullDraft,
        dependencies: [
          { predecessorName: "存在しない", successorName: "要件定義", type: "FS" },
          { predecessorName: "要件定義", successorName: "構成設計", type: "FS" },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const summary = res.json();
    expect(summary.dependencies.succeeded).toBe(1);
    expect(summary.dependencies.failed).toBe(1);
    expect(summary.dependencies.failures[0].reason).toContain("タスク名が見つかりません");
  });

  it("循環依存は409を返す", async () => {
    const project = await createProject(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/plan-draft-import`,
      payload: {
        tasks: [
          {
            name: "フェーズ",
            durationDays: 0,
            children: [
              { name: "A", durationDays: 1, description: "a" },
              { name: "B", durationDays: 1, description: "b" },
            ],
          },
        ],
        dependencies: [
          { predecessorName: "A", successorName: "B", type: "FS" },
          { predecessorName: "B", successorName: "A", type: "FS" },
        ],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("存在しないプロジェクトは404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/nope/plan-draft-import",
      payload: fullDraft,
    });
    expect(res.statusCode).toBe(404);
  });
});
