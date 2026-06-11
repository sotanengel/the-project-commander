import { TaskCreateSchema, TaskSchema, TaskUpdateSchema, validateTaskParent } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { projectExists } from "../repositories/project.js";
import {
  BulkBodySchema,
  createTaskRepository,
  getTask,
  listTasks,
  nextSortOrder,
} from "../repositories/task.js";

export default async function taskRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const { insertTask, insertTaskTree } = createTaskRepository(db);

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks",
    async (req, reply) => {
      if (!projectExists(db, req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      return listTasks(db, req.params.projectId);
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(db, projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const input = TaskCreateSchema.parse(req.body);
      const taskId = newId();
      const parentError = validateTaskParent(
        listTasks(db, projectId),
        projectId,
        taskId,
        input.parentId,
      );
      if (parentError) return reply.code(400).send({ error: parentError });
      const task = TaskSchema.parse({
        ...input,
        id: taskId,
        projectId,
        sortOrder: input.sortOrder ?? nextSortOrder(db, projectId, input.parentId ?? null),
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
      if (!projectExists(db, projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const { tasks } = BulkBodySchema.parse(req.body);
      const created = db.transaction(() => insertTaskTree(projectId, tasks, null))();
      reply.code(201);
      return created;
    },
  );

  app.put<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const existing = getTask(db, req.params.id);
    if (!existing) return reply.code(404).send({ error: "タスクが見つかりません" });
    const input = TaskUpdateSchema.parse(req.body);
    if ("parentId" in input) {
      const parentError = validateTaskParent(
        listTasks(db, existing.projectId),
        existing.projectId,
        existing.id,
        input.parentId,
      );
      if (parentError) return reply.code(400).send({ error: parentError });
    }
    const updated = TaskSchema.parse({ ...existing, ...input });
    db.prepare(
      `UPDATE tasks SET parentId = @parentId, name = @name, description = @description,
       durationDays = @durationDays, progress = @progress, assignee = @assignee, sortOrder = @sortOrder
       WHERE id = @id`,
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const existing = getTask(db, req.params.id);
    if (!existing) return reply.code(404).send({ error: "タスクが見つかりません" });
    db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}
