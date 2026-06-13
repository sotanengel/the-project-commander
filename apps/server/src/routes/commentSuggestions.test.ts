import type { CommentSuggestion } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractClaudePrintResult } from "../agent/claudeCliSession.js";
import type { CliAgentService } from "../agent/index.js";
import { buildMcpConfigContent } from "../agent/mcpConfig.js";
import { buildApp } from "../app.js";
import { createDb } from "../db.js";

function mockCliAgent(overrides: Partial<CliAgentService> = {}): CliAgentService {
  return {
    init: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    getStatus: vi.fn(() => ({
      provider: "claude" as const,
      ready: true,
      mcpConnected: true,
    })),
    analyzeComment: vi.fn(async () => []),
    ...overrides,
  };
}

describe("comment suggestions API", () => {
  let app: FastifyInstance;
  let projectId: string;
  let taskId: string;
  let cliAgent: CliAgentService;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    process.env.TPC_CLI_AGENT = "off";
    cliAgent = mockCliAgent();
    app = await buildApp(createDb(":memory:"), { cliAgent });
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
    expect(res.json()).toMatchObject({ provider: "claude", ready: true });
  });

  it("CLI 未準備時は 503", async () => {
    cliAgent = mockCliAgent({
      getStatus: vi.fn((): import("../agent/cliAgentStatus.js").CliAgentStatus => ({
        provider: "off",
        ready: false,
        mcpConnected: false,
        message: "無効",
      })),
    });
    await app.close();
    app = await buildApp(createDb(":memory:"), { cliAgent });
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
    cliAgent = mockCliAgent({
      analyzeComment: vi.fn(async () => suggestions),
    });
    await app.close();
    app = await buildApp(createDb(":memory:"), { cliAgent });
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

describe("mcpConfig", () => {
  it("PORT を MCP URL に埋め込む", () => {
    const content = buildMcpConfigContent(3456);
    expect(content).toContain("http://127.0.0.1:3456/mcp");
  });
});

describe("extractClaudePrintResult", () => {
  it("JSON 出力から result を取り出す", () => {
    const stdout = JSON.stringify({ type: "result", result: '{"suggestions":[]}' });
    expect(extractClaudePrintResult(stdout)).toBe('{"suggestions":[]}');
  });

  it("プレーンテキストも受け付ける", () => {
    expect(extractClaudePrintResult('{"suggestions":[]}')).toBe('{"suggestions":[]}');
  });
});
