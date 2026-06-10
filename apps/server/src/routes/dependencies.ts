import {
  type Dependency,
  DependencyCreateSchema,
  DependencySchema,
  type Task,
  topologicalSort,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

export default async function dependencyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  function assertNoCycle(projectId: string, candidate: Dependency, excludeId?: string) {
    const tasks = db.prepare("SELECT * FROM tasks WHERE projectId = ?").all(projectId) as Task[];
    const deps = (
      db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId) as Dependency[]
    ).filter((d) => d.id !== excludeId);
    // CycleError はアプリ共通のエラーハンドラで409に変換される
    topologicalSort(tasks, [...deps, candidate]);
  }

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/dependencies",
    async (req) => {
      return db
        .prepare("SELECT * FROM dependencies WHERE projectId = ?")
        .all(req.params.projectId) as Dependency[];
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/dependencies",
    async (req, reply) => {
      const { projectId } = req.params;
      const input = DependencyCreateSchema.parse(req.body);
      if (input.predecessorId === input.successorId) {
        return reply.code(400).send({ error: "自分自身への依存は設定できません" });
      }
      for (const taskId of [input.predecessorId, input.successorId]) {
        const row = db
          .prepare("SELECT 1 FROM tasks WHERE id = ? AND projectId = ?")
          .get(taskId, projectId);
        if (!row) return reply.code(404).send({ error: `タスクが見つかりません: ${taskId}` });
      }
      const dependency = DependencySchema.parse({ ...input, id: newId(), projectId });
      assertNoCycle(projectId, dependency);
      db.prepare(
        `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
         VALUES (@id, @projectId, @predecessorId, @successorId, @type, @lagDays)`,
      ).run(dependency);
      reply.code(201);
      return dependency;
    },
  );

  app.put<{ Params: { id: string } }>("/api/dependencies/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM dependencies WHERE id = ?").get(req.params.id) as
      | Dependency
      | undefined;
    if (!existing) return reply.code(404).send({ error: "依存関係が見つかりません" });
    const input = DependencyCreateSchema.partial().parse(req.body);
    const updated = DependencySchema.parse({ ...existing, ...input });
    assertNoCycle(updated.projectId, updated, updated.id);
    db.prepare(
      "UPDATE dependencies SET predecessorId = @predecessorId, successorId = @successorId, type = @type, lagDays = @lagDays WHERE id = @id",
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/dependencies/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM dependencies WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "依存関係が見つかりません" });
    return { ok: true };
  });
}
