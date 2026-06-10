import { type Task, TaskCreateSchema, TaskSchema, TaskUpdateSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type Db, newId } from "../db.js";

/** 階層構造のままタスクを一括登録するための入力（AI取り込み・MCPで使用） */
interface BulkTaskInput {
  name: string;
  description?: string;
  durationDays?: number;
  progress?: number;
  assignee?: string;
  children?: BulkTaskInput[];
}
const BulkTaskSchema: z.ZodType<BulkTaskInput> = z.object({
  name: z.string().min(1, "タスク名は必須です"),
  description: z.string().optional(),
  durationDays: z.number().nonnegative().optional(),
  progress: z.number().min(0).max(100).optional(),
  assignee: z.string().optional(),
  children: z.lazy(() => z.array(BulkTaskSchema)).optional(),
});
const BulkBodySchema = z.object({ tasks: z.array(BulkTaskSchema) });

export default async function taskRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, projectId, parentId, name, description, durationDays, progress, assignee, sortOrder)
     VALUES (@id, @projectId, @parentId, @name, @description, @durationDays, @progress, @assignee, @sortOrder)`,
  );

  function projectExists(projectId: string): boolean {
    return db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
  }

  function nextSortOrder(projectId: string, parentId: string | null): number {
    const row = db
      .prepare(
        "SELECT COALESCE(MAX(sortOrder), -1) + 1 AS next FROM tasks WHERE projectId = ? AND parentId IS ?",
      )
      .get(projectId, parentId) as { next: number };
    return row.next;
  }

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks",
    async (req, reply) => {
      if (!projectExists(req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      return db
        .prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder")
        .all(req.params.projectId) as Task[];
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const input = TaskCreateSchema.parse(req.body);
      const task = TaskSchema.parse({
        ...input,
        id: newId(),
        projectId,
        sortOrder: input.sortOrder ?? nextSortOrder(projectId, input.parentId ?? null),
      });
      insertTask.run(task);
      reply.code(201);
      return task;
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks/bulk",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const { tasks } = BulkBodySchema.parse(req.body);
      const created: Task[] = [];
      const insertTree = db.transaction((items: BulkTaskInput[], parentId: string | null) => {
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
      });
      insertTree(tasks, null);
      reply.code(201);
      return created;
    },
  );

  app.put<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "タスクが見つかりません" });
    const input = TaskUpdateSchema.parse(req.body);
    const updated = TaskSchema.parse({ ...existing, ...input });
    db.prepare(
      `UPDATE tasks SET parentId = @parentId, name = @name, description = @description,
       durationDays = @durationDays, progress = @progress, assignee = @assignee, sortOrder = @sortOrder
       WHERE id = @id`,
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "タスクが見つかりません" });
    return { ok: true };
  });
}
