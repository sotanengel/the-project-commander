import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { type Db, createDb } from "../db.js";
import { createMcpServer } from "./server.js";

interface TextContent {
  type: "text";
  text: string;
}

function resultJson(result: unknown): unknown {
  const r = result as { content: TextContent[]; isError?: boolean };
  expect(r.isError ?? false).toBe(false);
  return JSON.parse(r.content[0].text);
}

function resultError(result: unknown): string {
  const r = result as { content: TextContent[]; isError?: boolean };
  expect(r.isError).toBe(true);
  return r.content[0].text;
}

describe("MCPツール（InMemoryTransport結合）", () => {
  let db: Db;
  let client: Client;

  beforeEach(async () => {
    db = createDb(":memory:");
    const server = createMcpServer(db);
    client = new Client({ name: "test-client", version: "0.0.1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
    db.close();
  });

  async function createProject(): Promise<string> {
    const result = await client.callTool({
      name: "create_project",
      arguments: { name: "テストPJ", startDate: "2026-06-10", description: "説明" },
    });
    const project = resultJson(result) as { id: string };
    expect(project.id).toBeTruthy();
    return project.id;
  }

  it("ツールが9個定義されている", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "list_projects",
        "create_project",
        "get_project_plan",
        "add_tasks",
        "update_task",
        "delete_task",
        "set_dependencies",
        "get_critical_path",
        "add_risks",
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("create_project → list_projects で作成したプロジェクトが返る", async () => {
    const projectId = await createProject();
    const list = resultJson(await client.callTool({ name: "list_projects", arguments: {} })) as {
      id: string;
      name: string;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(projectId);
    expect(list[0].name).toBe("テストPJ");
  });

  it("create_project は不正な日付でエラー（isError）を返す", async () => {
    const result = await client.callTool({
      name: "create_project",
      arguments: { name: "x", startDate: "2026/06/10" },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("add_tasks で階層タスクを一括登録できる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            {
              name: "設計フェーズ",
              children: [
                { name: "基本設計", durationDays: 3 },
                { name: "詳細設計", durationDays: 5, assignee: "山田" },
              ],
            },
            { name: "実装", durationDays: 10 },
          ],
        },
      }),
    ) as { id: string; name: string; parentId: string | null }[];
    expect(created).toHaveLength(4);
    const summary = created.find((t) => t.name === "設計フェーズ");
    const child = created.find((t) => t.name === "詳細設計");
    expect(summary?.parentId).toBeNull();
    expect(child?.parentId).toBe(summary?.id);

    const rows = db.prepare("SELECT * FROM tasks WHERE projectId = ?").all(projectId);
    expect(rows).toHaveLength(4);
  });

  it("add_tasks は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "add_tasks",
      arguments: { projectId: "nope", tasks: [{ name: "x" }] },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });

  it("update_task で部分更新できる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: { projectId, tasks: [{ name: "実装", durationDays: 5 }] },
      }),
    ) as { id: string }[];
    const updated = resultJson(
      await client.callTool({
        name: "update_task",
        arguments: { taskId: created[0].id, progress: 50, assignee: "佐藤" },
      }),
    ) as { progress: number; assignee: string; durationDays: number; name: string };
    expect(updated.progress).toBe(50);
    expect(updated.assignee).toBe("佐藤");
    expect(updated.durationDays).toBe(5);
    expect(updated.name).toBe("実装");
  });

  it("update_task は存在しないタスクでエラーを返す", async () => {
    const result = await client.callTool({
      name: "update_task",
      arguments: { taskId: "nope", progress: 10 },
    });
    expect(resultError(result)).toContain("タスクが見つかりません");
  });

  it("delete_task で子タスク・依存関係もカスケード削除される", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "親", children: [{ name: "子A", durationDays: 2 }] },
            { name: "別タスク", durationDays: 1 },
          ],
        },
      }),
    ) as { id: string; name: string }[];
    const parent = created.find((t) => t.name === "親");
    const childA = created.find((t) => t.name === "子A");
    const other = created.find((t) => t.name === "別タスク");
    if (!parent || !childA || !other) throw new Error("setup failed");

    await client.callTool({
      name: "set_dependencies",
      arguments: {
        projectId,
        dependencies: [{ predecessorId: childA.id, successorId: other.id }],
      },
    });

    resultJson(await client.callTool({ name: "delete_task", arguments: { taskId: parent.id } }));

    const remaining = db.prepare("SELECT name FROM tasks WHERE projectId = ?").all(projectId) as {
      name: string;
    }[];
    expect(remaining.map((r) => r.name)).toEqual(["別タスク"]);
    const deps = db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId);
    expect(deps).toHaveLength(0);
  });

  it("set_dependencies で一括登録・重複スキップができる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "A", durationDays: 2 },
            { name: "B", durationDays: 3 },
            { name: "C", durationDays: 1 },
          ],
        },
      }),
    ) as { id: string; name: string }[];
    const [a, b, c] = created;

    const res = resultJson(
      await client.callTool({
        name: "set_dependencies",
        arguments: {
          projectId,
          dependencies: [
            { predecessorId: a.id, successorId: b.id },
            { predecessorId: a.id, successorId: b.id },
            { predecessorId: b.id, successorId: c.id, type: "SS", lagDays: 1 },
          ],
        },
      }),
    ) as { created: unknown[]; skipped: number };
    expect(res.created).toHaveLength(2);
    expect(res.skipped).toBe(1);
  });

  it("set_dependencies は循環をエラーで知らせる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "A", durationDays: 2 },
            { name: "B", durationDays: 3 },
          ],
        },
      }),
    ) as { id: string }[];
    const [a, b] = created;

    const result = await client.callTool({
      name: "set_dependencies",
      arguments: {
        projectId,
        dependencies: [
          { predecessorId: a.id, successorId: b.id },
          { predecessorId: b.id, successorId: a.id },
        ],
      },
    });
    expect(resultError(result)).toContain("循環");
    // 循環を含むバッチは登録されない（全ロールバック）
    const deps = db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId);
    expect(deps).toHaveLength(0);
  });

  it("get_critical_path がタスク名・期間・フロートを返す", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "設計", durationDays: 3 },
            { name: "実装", durationDays: 5 },
            { name: "ドキュメント", durationDays: 1 },
          ],
        },
      }),
    ) as { id: string; name: string }[];
    const [design, impl, doc] = created;
    await client.callTool({
      name: "set_dependencies",
      arguments: {
        projectId,
        dependencies: [
          { predecessorId: design.id, successorId: impl.id },
          { predecessorId: design.id, successorId: doc.id },
        ],
      },
    });

    const cp = resultJson(
      await client.callTool({ name: "get_critical_path", arguments: { projectId } }),
    ) as {
      projectDuration: number;
      criticalPath: { name: string }[];
      tasks: { name: string; totalFloat: number; isCritical: boolean }[];
    };
    expect(cp.projectDuration).toBe(8);
    expect(cp.criticalPath.map((t) => t.name)).toEqual(["設計", "実装"]);
    const docFloat = cp.tasks.find((t) => t.name === "ドキュメント");
    expect(docFloat?.totalFloat).toBe(4);
    expect(docFloat?.isCritical).toBe(false);
  });

  it("add_risks でリスクを一括登録できる", async () => {
    const projectId = await createProject();
    const risks = resultJson(
      await client.callTool({
        name: "add_risks",
        arguments: {
          projectId,
          risks: [
            {
              title: "キーパーソン離脱",
              probability: "low",
              impact: "high",
              response: "引継ぎ文書化",
            },
            { title: "要件膨張" },
          ],
        },
      }),
    ) as { title: string; probability: string; impact: string }[];
    expect(risks).toHaveLength(2);
    expect(risks[0].probability).toBe("low");
    expect(risks[1].probability).toBe("medium");
    const rows = db.prepare("SELECT * FROM risks WHERE projectId = ?").all(projectId);
    expect(rows).toHaveLength(2);
  });

  it("get_project_plan がタスク・依存・マイルストーン・CPMを返す", async () => {
    const projectId = await createProject();
    await client.callTool({
      name: "add_tasks",
      arguments: { projectId, tasks: [{ name: "唯一のタスク", durationDays: 4 }] },
    });
    const plan = resultJson(
      await client.callTool({ name: "get_project_plan", arguments: { projectId } }),
    ) as {
      project: { id: string };
      tasks: unknown[];
      dependencies: unknown[];
      milestones: unknown[];
      cpm: { projectDuration: number };
    };
    expect(plan.project.id).toBe(projectId);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.cpm.projectDuration).toBe(4);
  });

  it("get_project_plan は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "get_project_plan",
      arguments: { projectId: "nope" },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });
});

describe("POST /mcp（Streamable HTTP）", () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp(createDb(":memory:"));
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it("MCPクライアントで initialize → tools/list → tools/call の一連が動く", async () => {
    const client = new Client({ name: "http-test", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(9);
      const result = await client.callTool({
        name: "create_project",
        arguments: { name: "HTTP経由PJ", startDate: "2026-07-01" },
      });
      const project = resultJson(result) as { name: string };
      expect(project.name).toBe("HTTP経由PJ");
    } finally {
      await client.close();
    }
  });

  it("GET /mcp と DELETE /mcp は405を返す", async () => {
    for (const method of ["GET", "DELETE"] as const) {
      const res = await fetch(`${baseUrl}/mcp`, { method });
      expect(res.status).toBe(405);
    }
  });
});
