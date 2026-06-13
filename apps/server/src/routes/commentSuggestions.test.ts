import type { CommentSuggestion } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAgentService } from "../agent/index.js";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

function mockLocalAgent(overrides: Partial<LocalAgentService> = {}): LocalAgentService {
  return {
    init: vi.fn(async () => {}),
    getStatus: vi.fn(() => ({
      provider: "ollama" as const,
      ready: true,
      model: "qwen2.5:7b-instruct",
    })),
    analyzeComment: vi.fn(async () => []),
    ...overrides,
  };
}

describe("comment suggestions API", () => {
  let app: FastifyInstance;
  let projectId: string;
  let taskId: string;
  let localAgent: LocalAgentService;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.TPC_LOCAL_AGENT = "off";
    localAgent = mockLocalAgent();
    app = await buildApp(createDb(":memory:"), { localAgent });
    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "提案テスト", description: "概要", startDate: "2026-06-10" },
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

  it("GET /api/agent/status が状態を返す", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ provider: "ollama", ready: true });
  });

  it("エージェント未準備時は 503", async () => {
    localAgent = mockLocalAgent({
      getStatus: vi.fn(() => ({
        provider: "off" as const,
        ready: false,
        message: "無効",
      })),
    });
    await app.close();
    app = await buildApp(createDb(":memory:"), { localAgent });
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/comment-suggestions`,
      payload: { projectId, commentBody: "進捗更新" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("提案を返す", async () => {
    const suggestions: CommentSuggestion[] = [
      {
        id: "s1",
        kind: "update_task",
        label: "進捗50%",
        rationale: "コメントに基づく",
        taskId,
        changes: { progress: 50 },
      },
    ];
    localAgent = mockLocalAgent({
      analyzeComment: vi.fn(async () => suggestions),
    });
    await app.close();
    app = await buildApp(createDb(":memory:"), { localAgent });
    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "再作成", description: "概要", startDate: "2026-06-10" },
    });
    const pid = projectRes.json().id;
    const taskRes = await app.inject({
      method: "POST",
      url: `/api/projects/${pid}/tasks`,
      payload: { name: "T" },
    });
    const tid = taskRes.json().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${tid}/comment-suggestions`,
      payload: { projectId: pid, commentBody: "半分完了" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestions).toHaveLength(1);
  });

  it("projectId 不一致は 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/comment-suggestions`,
      payload: { projectId: "wrong-project", commentBody: "test" },
    });
    expect(res.statusCode).toBe(404);
  });
});
