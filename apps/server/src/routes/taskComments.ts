import { TaskCommentCreateSchema, TaskCommentUpdateSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { getTask } from "../repositories/task.js";
import {
  deleteComment,
  getComment,
  insertComment,
  listCommentsByTask,
  updateComment,
} from "../repositories/taskComment.js";

export default async function taskCommentRoutes(
  app: FastifyInstance,
  { db }: { db: import("../db.js").Db },
) {
  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/comments", async (req, reply) => {
    const task = getTask(db, req.params.taskId);
    if (!task) return reply.code(404).send({ error: "タスクが見つかりません" });
    return listCommentsByTask(db, req.params.taskId);
  });

  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/comments", async (req, reply) => {
    const task = getTask(db, req.params.taskId);
    if (!task) return reply.code(404).send({ error: "タスクが見つかりません" });
    const input = TaskCommentCreateSchema.parse(req.body);
    const comment = insertComment(db, req.params.taskId, input.body);
    reply.code(201);
    return comment;
  });

  app.put<{ Params: { id: string } }>("/api/task-comments/:id", async (req, reply) => {
    const existing = getComment(db, req.params.id);
    if (!existing) return reply.code(404).send({ error: "コメントが見つかりません" });
    const input = TaskCommentUpdateSchema.parse(req.body);
    const updated = updateComment(db, req.params.id, input.body);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/task-comments/:id", async (req, reply) => {
    const existing = getComment(db, req.params.id);
    if (!existing) return reply.code(404).send({ error: "コメントが見つかりません" });
    deleteComment(db, req.params.id);
    return { ok: true };
  });
}
