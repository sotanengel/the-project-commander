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
  const first = r.content[0];
  if (!first) throw new Error("empty tool result");
  return JSON.parse(first.text);
}

function resultError(result: unknown): string {
  const r = result as { content: TextContent[]; isError?: boolean };
  expect(r.isError).toBe(true);
  const first = r.content[0];
  if (!first) throw new Error("empty tool error");
  return first.text;
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

  it("ツールが14個定義されている", async () => {
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
        "add_milestones",
        "add_stakeholders",
        "list_risks",
        "create_baseline",
        "export_project",
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
    expect(list[0]?.id).toBe(projectId);
    expect(list[0]?.name).toBe("テストPJ");
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
        arguments: { taskId: created[0]?.id, progress: 50, assignee: "佐藤" },
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
    const a = created[0];
    const b = created[1];
    const c = created[2];
    if (!a || !b || !c) throw new Error("setup failed");

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
    const a = created[0];
    const b = created[1];
    if (!a || !b) throw new Error("setup failed");

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
    const design = created[0];
    const impl = created[1];
    const doc = created[2];
    if (!design || !impl || !doc) throw new Error("setup failed");
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
    expect(risks[0]?.probability).toBe("low");
    expect(risks[1]?.probability).toBe("medium");
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

  it("add_milestones でマイルストーンを一括登録できる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_milestones",
        arguments: {
          projectId,
          milestones: [
            { name: "要件確定", dueDate: "2026-07-01" },
            { name: "リリース", dueDate: "2026-09-30", status: "pending" },
          ],
        },
      }),
    ) as { id: string; name: string; dueDate: string; status: string }[];
    expect(created).toHaveLength(2);
    expect(created[0]?.name).toBe("要件確定");
    expect(created[0]?.status).toBe("pending");
    expect(created[1]?.dueDate).toBe("2026-09-30");
    const rows = db.prepare("SELECT * FROM milestones WHERE projectId = ?").all(projectId);
    expect(rows).toHaveLength(2);
  });

  it("add_milestones は不正な日付でエラーを返す", async () => {
    const projectId = await createProject();
    const result = await client.callTool({
      name: "add_milestones",
      arguments: { projectId, milestones: [{ name: "x", dueDate: "2026/07/01" }] },
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("add_milestones は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "add_milestones",
      arguments: { projectId: "nope", milestones: [{ name: "x", dueDate: "2026-07-01" }] },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });

  it("add_stakeholders でステークホルダーを一括登録できる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_stakeholders",
        arguments: {
          projectId,
          stakeholders: [
            {
              name: "鈴木部長",
              role: "スポンサー",
              influence: "high",
              interest: "medium",
              note: "月次で報告",
            },
            { name: "田中" },
          ],
        },
      }),
    ) as { id: string; name: string; role: string; influence: string; interest: string }[];
    expect(created).toHaveLength(2);
    expect(created[0]?.influence).toBe("high");
    expect(created[0]?.role).toBe("スポンサー");
    expect(created[1]?.influence).toBe("medium");
    expect(created[1]?.role).toBe("");
    const rows = db.prepare("SELECT * FROM stakeholders WHERE projectId = ?").all(projectId);
    expect(rows).toHaveLength(2);
  });

  it("add_stakeholders は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "add_stakeholders",
      arguments: { projectId: "nope", stakeholders: [{ name: "x" }] },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });

  it("list_risks でリスク一覧を取得できる", async () => {
    const projectId = await createProject();
    await client.callTool({
      name: "add_risks",
      arguments: {
        projectId,
        risks: [
          { title: "キーパーソン離脱", probability: "low", impact: "high", response: "引継ぎ" },
          { title: "要件膨張", status: "watching" },
        ],
      },
    });
    const risks = resultJson(
      await client.callTool({ name: "list_risks", arguments: { projectId } }),
    ) as { title: string; probability: string; impact: string; response: string; status: string }[];
    expect(risks).toHaveLength(2);
    const r1 = risks.find((r) => r.title === "キーパーソン離脱");
    expect(r1?.probability).toBe("low");
    expect(r1?.impact).toBe("high");
    expect(r1?.response).toBe("引継ぎ");
    expect(r1?.status).toBe("open");
    const r2 = risks.find((r) => r.title === "要件膨張");
    expect(r2?.status).toBe("watching");
  });

  it("list_risks はリスク未登録なら空配列を返す", async () => {
    const projectId = await createProject();
    const risks = resultJson(
      await client.callTool({ name: "list_risks", arguments: { projectId } }),
    ) as unknown[];
    expect(risks).toEqual([]);
  });

  it("list_risks は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "list_risks",
      arguments: { projectId: "nope" },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });

  it("create_baseline で現計画のスナップショットを保存できる", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "設計", durationDays: 3 },
            { name: "実装", durationDays: 5 },
          ],
        },
      }),
    ) as { id: string }[];
    const a = created[0];
    const b = created[1];
    if (!a || !b) throw new Error("setup failed");
    await client.callTool({
      name: "set_dependencies",
      arguments: { projectId, dependencies: [{ predecessorId: a.id, successorId: b.id }] },
    });

    const baseline = resultJson(
      await client.callTool({
        name: "create_baseline",
        arguments: { projectId, label: "承認版v1" },
      }),
    ) as { id: string; label: string; projectDuration: number; taskCount: number };
    expect(baseline.id).toBeTruthy();
    expect(baseline.label).toBe("承認版v1");
    expect(baseline.projectDuration).toBe(8);
    expect(baseline.taskCount).toBe(2);

    const rows = db.prepare("SELECT * FROM baselines WHERE projectId = ?").all(projectId) as {
      label: string;
      data: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("承認版v1");
    const data = JSON.parse(rows[0]?.data ?? "{}") as {
      projectDuration: number;
      tasks: { taskId: string; name: string; earlyStart: number; earlyFinish: number }[];
    };
    expect(data.projectDuration).toBe(8);
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.map((t) => t.name).sort()).toEqual(["実装", "設計"]);
  });

  it("create_baseline はラベル省略時に空文字で保存する", async () => {
    const projectId = await createProject();
    const baseline = resultJson(
      await client.callTool({ name: "create_baseline", arguments: { projectId } }),
    ) as { label: string; projectDuration: number; taskCount: number };
    expect(baseline.label).toBe("");
    expect(baseline.projectDuration).toBe(0);
    expect(baseline.taskCount).toBe(0);
  });

  it("create_baseline は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "create_baseline",
      arguments: { projectId: "nope" },
    });
    expect(resultError(result)).toContain("プロジェクトが見つかりません");
  });

  it("export_project がExportBundle（プロジェクト一式）を返す", async () => {
    const projectId = await createProject();
    const created = resultJson(
      await client.callTool({
        name: "add_tasks",
        arguments: {
          projectId,
          tasks: [
            { name: "設計", durationDays: 3 },
            { name: "実装", durationDays: 5 },
          ],
        },
      }),
    ) as { id: string }[];
    const a = created[0];
    const b = created[1];
    if (!a || !b) throw new Error("setup failed");
    await client.callTool({
      name: "set_dependencies",
      arguments: { projectId, dependencies: [{ predecessorId: a.id, successorId: b.id }] },
    });
    await client.callTool({
      name: "add_milestones",
      arguments: { projectId, milestones: [{ name: "リリース", dueDate: "2026-09-30" }] },
    });
    await client.callTool({
      name: "add_risks",
      arguments: { projectId, risks: [{ title: "要件膨張" }] },
    });
    await client.callTool({
      name: "add_stakeholders",
      arguments: { projectId, stakeholders: [{ name: "鈴木部長" }] },
    });
    await client.callTool({
      name: "create_baseline",
      arguments: { projectId, label: "v1" },
    });

    const bundle = resultJson(
      await client.callTool({ name: "export_project", arguments: { projectId } }),
    ) as {
      version: number;
      exportedAt: string;
      project: { id: string; name: string };
      tasks: unknown[];
      dependencies: unknown[];
      milestones: unknown[];
      risks: unknown[];
      stakeholders: unknown[];
      baselines: { label: string; projectDuration: number; tasks: unknown[] }[];
    };
    expect(bundle.version).toBe(1);
    expect(bundle.exportedAt).toBeTruthy();
    expect(bundle.project.id).toBe(projectId);
    expect(bundle.tasks).toHaveLength(2);
    expect(bundle.dependencies).toHaveLength(1);
    expect(bundle.milestones).toHaveLength(1);
    expect(bundle.risks).toHaveLength(1);
    expect(bundle.stakeholders).toHaveLength(1);
    expect(bundle.baselines).toHaveLength(1);
    expect(bundle.baselines[0]?.label).toBe("v1");
    expect(bundle.baselines[0]?.projectDuration).toBe(8);
    expect(bundle.baselines[0]?.tasks).toHaveLength(2);
  });

  it("export_project は存在しないプロジェクトでエラーを返す", async () => {
    const result = await client.callTool({
      name: "export_project",
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
      expect(tools).toHaveLength(14);
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
