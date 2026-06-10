import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type Dependency,
  DependencyCreateSchema,
  DependencySchema,
  type Milestone,
  type Project,
  ProjectCreateSchema,
  type ProjectPlan,
  ProjectSchema,
  type Risk,
  RiskCreateSchema,
  RiskSchema,
  type Task,
  TaskSchema,
  TaskUpdateSchema,
  computeCpm,
  topologicalSort,
} from "@tpc/shared";
import { z } from "zod";
import { type Db, newId } from "../db.js";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function toolError(message: string): never {
  throw new Error(message);
}

interface BulkTaskInput {
  name: string;
  description?: string;
  durationDays?: number;
  progress?: number;
  assignee?: string;
  children?: BulkTaskInput[];
}

const BulkTaskSchema: z.ZodType<BulkTaskInput> = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationDays: z.number().nonnegative().optional(),
  progress: z.number().min(0).max(100).optional(),
  assignee: z.string().optional(),
  children: z.lazy(() => z.array(BulkTaskSchema)).optional(),
});

export function createMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: "the-project-commander", version: "0.1.0" });

  function projectExists(projectId: string): boolean {
    return db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
  }

  function getTask(id: string): Task | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
  }

  function loadPlan(projectId: string): ProjectPlan {
    const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    if (!projectRow) toolError("プロジェクトが見つかりません");
    const project = ProjectSchema.parse(projectRow);
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder")
      .all(projectId) as Task[];
    const dependencies = db
      .prepare("SELECT * FROM dependencies WHERE projectId = ?")
      .all(projectId) as Dependency[];
    const milestones = db
      .prepare("SELECT * FROM milestones WHERE projectId = ? ORDER BY dueDate")
      .all(projectId) as Milestone[];
    return {
      project,
      tasks,
      dependencies,
      milestones,
      cpm: computeCpm(tasks, dependencies),
    };
  }

  function nextSortOrder(projectId: string, parentId: string | null): number {
    const row = db
      .prepare(
        "SELECT COALESCE(MAX(sortOrder), -1) + 1 AS next FROM tasks WHERE projectId = ? AND parentId IS ?",
      )
      .get(projectId, parentId) as { next: number };
    return row.next;
  }

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, projectId, parentId, name, description, durationDays, progress, assignee, sortOrder)
     VALUES (@id, @projectId, @parentId, @name, @description, @durationDays, @progress, @assignee, @sortOrder)`,
  );

  function insertTaskTree(
    projectId: string,
    items: BulkTaskInput[],
    parentId: string | null,
  ): Task[] {
    const created: Task[] = [];
    const walk = (nodes: BulkTaskInput[], parent: string | null) => {
      let order = nextSortOrder(projectId, parent);
      for (const node of nodes) {
        const { children, ...fields } = node;
        const task = TaskSchema.parse({
          ...fields,
          id: newId(),
          projectId,
          parentId: parent,
          sortOrder: order++,
        });
        insertTask.run(task);
        created.push(task);
        if (children && children.length > 0) walk(children, task.id);
      }
    };
    walk(items, parentId);
    return created;
  }

  server.registerTool(
    "list_projects",
    { description: "登録済みプロジェクト一覧を返す" },
    async () => {
      const rows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC").all();
      return jsonContent(rows.map((r) => ProjectSchema.parse(r)));
    },
  );

  server.registerTool(
    "create_project",
    {
      description: "新しいプロジェクトを作成する",
      inputSchema: {
        name: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const input = ProjectCreateSchema.parse(args);
        const project: Project = {
          id: newId(),
          name: input.name,
          description: input.description ?? "",
          startDate: input.startDate,
          createdAt: new Date().toISOString(),
        };
        db.prepare(
          "INSERT INTO projects (id, name, description, startDate, createdAt) VALUES (@id, @name, @description, @startDate, @createdAt)",
        ).run(project);
        return jsonContent(project);
      } catch (e) {
        toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_project_plan",
    {
      description: "プロジェクト計画（タスク・依存・マイルストーン・CPM）を返す",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      if (!projectExists(projectId)) toolError("プロジェクトが見つかりません");
      return jsonContent(loadPlan(projectId));
    },
  );

  server.registerTool(
    "add_tasks",
    {
      description: "階層構造のタスクを一括登録する",
      inputSchema: {
        projectId: z.string(),
        tasks: z.array(BulkTaskSchema),
      },
    },
    async ({ projectId, tasks }) => {
      if (!projectExists(projectId)) toolError("プロジェクトが見つかりません");
      const created = db.transaction(() => insertTaskTree(projectId, tasks, null))();
      return jsonContent(created);
    },
  );

  server.registerTool(
    "update_task",
    {
      description: "タスクを部分更新する",
      inputSchema: {
        taskId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        durationDays: z.number().nonnegative().optional(),
        progress: z.number().min(0).max(100).optional(),
        assignee: z.string().optional(),
        parentId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      },
    },
    async ({ taskId, ...fields }) => {
      const existing = getTask(taskId);
      if (!existing) toolError("タスクが見つかりません");
      const input = TaskUpdateSchema.parse(fields);
      const updated = TaskSchema.parse({ ...existing, ...input });
      db.prepare(
        `UPDATE tasks SET parentId = @parentId, name = @name, description = @description,
         durationDays = @durationDays, progress = @progress, assignee = @assignee, sortOrder = @sortOrder
         WHERE id = @id`,
      ).run(updated);
      return jsonContent(updated);
    },
  );

  server.registerTool(
    "delete_task",
    {
      description: "タスクを削除する（子孫・関連依存もカスケード削除）",
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) => {
      const existing = getTask(taskId);
      if (!existing) toolError("タスクが見つかりません");
      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    "set_dependencies",
    {
      description: "依存関係を一括登録する（重複はスキップ、循環時は全ロールバック）",
      inputSchema: {
        projectId: z.string(),
        dependencies: z.array(
          z.object({
            predecessorId: z.string(),
            successorId: z.string(),
            type: z.enum(["FS", "SS", "FF", "SF"]).optional(),
            lagDays: z.number().optional(),
          }),
        ),
      },
    },
    async ({ projectId, dependencies }) => {
      if (!projectExists(projectId)) toolError("プロジェクトが見つかりません");

      const result = db.transaction(() => {
        const created: Dependency[] = [];
        let skipped = 0;
        const pending: Dependency[] = [];

        for (const raw of dependencies) {
          const input = DependencyCreateSchema.parse(raw);
          if (input.predecessorId === input.successorId) {
            toolError("自分自身への依存は設定できません");
          }
          for (const taskId of [input.predecessorId, input.successorId]) {
            const row = db
              .prepare("SELECT 1 FROM tasks WHERE id = ? AND projectId = ?")
              .get(taskId, projectId);
            if (!row) toolError(`タスクが見つかりません: ${taskId}`);
          }
          const dep = DependencySchema.parse({ ...input, id: newId(), projectId });
          const dupInDb = db
            .prepare(
              `SELECT 1 FROM dependencies
               WHERE projectId = ? AND predecessorId = ? AND successorId = ? AND type = ?`,
            )
            .get(projectId, dep.predecessorId, dep.successorId, dep.type);
          const dupInBatch = pending.some(
            (p) =>
              p.predecessorId === dep.predecessorId &&
              p.successorId === dep.successorId &&
              p.type === dep.type,
          );
          if (dupInDb || dupInBatch) {
            skipped++;
            continue;
          }
          pending.push(dep);
        }

        const tasks = db
          .prepare("SELECT * FROM tasks WHERE projectId = ?")
          .all(projectId) as Task[];
        const existing = db
          .prepare("SELECT * FROM dependencies WHERE projectId = ?")
          .all(projectId) as Dependency[];
        try {
          topologicalSort(tasks, [...existing, ...pending]);
        } catch (e) {
          toolError(e instanceof Error ? e.message : "依存関係に循環があります");
        }

        for (const dep of pending) {
          db.prepare(
            `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
             VALUES (@id, @projectId, @predecessorId, @successorId, @type, @lagDays)`,
          ).run(dep);
          created.push(dep);
        }
        return { created, skipped };
      })();

      return jsonContent(result);
    },
  );

  server.registerTool(
    "get_critical_path",
    {
      description: "クリティカルパスと各タスクのフロート情報を返す",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      if (!projectExists(projectId)) toolError("プロジェクトが見つかりません");
      const plan = loadPlan(projectId);
      const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
      const scheduledById = new Map(plan.cpm.tasks.map((s) => [s.taskId, s]));
      const tasks = plan.tasks
        .filter((t) => scheduledById.has(t.id))
        .map((t) => {
          const s = scheduledById.get(t.id);
          if (!s) return null;
          return {
            id: t.id,
            name: t.name,
            earlyStart: s.earlyStart,
            earlyFinish: s.earlyFinish,
            totalFloat: s.totalFloat,
            freeFloat: s.freeFloat,
            isCritical: s.isCritical,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const criticalPath = plan.cpm.criticalPath.map((id) => ({
        id,
        name: taskById.get(id)?.name ?? id,
      }));
      return jsonContent({
        projectDuration: plan.cpm.projectDuration,
        criticalPath,
        tasks,
      });
    },
  );

  server.registerTool(
    "add_risks",
    {
      description: "リスクを一括登録する",
      inputSchema: {
        projectId: z.string(),
        risks: z.array(
          z.object({
            title: z.string().min(1),
            probability: z.enum(["low", "medium", "high"]).optional(),
            impact: z.enum(["low", "medium", "high"]).optional(),
            response: z.string().optional(),
            status: z.enum(["open", "watching", "closed"]).optional(),
          }),
        ),
      },
    },
    async ({ projectId, risks }) => {
      if (!projectExists(projectId)) toolError("プロジェクトが見つかりません");
      const insert = db.prepare(
        `INSERT INTO risks (id, projectId, title, probability, impact, response, status)
         VALUES (@id, @projectId, @title, @probability, @impact, @response, @status)`,
      );
      const created: Risk[] = [];
      for (const raw of risks) {
        const input = RiskCreateSchema.parse(raw);
        const risk = RiskSchema.parse({ ...input, id: newId(), projectId });
        insert.run(risk);
        created.push(risk);
      }
      return jsonContent(created);
    },
  );

  return server;
}
