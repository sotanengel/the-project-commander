import {
  type Dependency,
  DependencyCreateSchema,
  DependencySchema,
  type Task,
  topologicalSort,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { projectExists } from "../repositories/project.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export default async function dependencyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  function getTaskInProject(taskId: string, projectId: string): Task | undefined {
    return db
      .prepare("SELECT * FROM tasks WHERE id = ? AND projectId = ?")
      .get(taskId, projectId) as Task | undefined;
  }

  function findDuplicate(
    projectId: string,
    predecessorId: string,
    successorId: string,
    type: string,
    excludeId?: string,
  ): boolean {
    const row = db
      .prepare(
        `SELECT 1 FROM dependencies
         WHERE projectId = ? AND predecessorId = ? AND successorId = ? AND type = ?
         AND id IS NOT ?`,
      )
      .get(projectId, predecessorId, successorId, type, excludeId ?? "");
    return row !== undefined;
  }

  function assertNoCycle(projectId: string, candidate: Dependency, excludeId?: string) {
    const tasks = db.prepare("SELECT * FROM tasks WHERE projectId = ?").all(projectId) as Task[];
    const deps = (
      db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId) as Dependency[]
    ).filter((d) => d.id !== excludeId);
    topologicalSort(tasks, [...deps, candidate]);
  }

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/dependencies",
    async (req, reply) => {
      if (!projectExists(db, req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      return db
        .prepare("SELECT * FROM dependencies WHERE projectId = ?")
        .all(req.params.projectId) as Dependency[];
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/dependencies",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(db, projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const input = DependencyCreateSchema.parse(req.body);
      if (input.predecessorId === input.successorId) {
        return reply.code(400).send({ error: "自分自身への依存は設定できません" });
      }
      for (const taskId of [input.predecessorId, input.successorId]) {
        if (!getTaskInProject(taskId, projectId)) {
          return reply.code(404).send({ error: `タスクが見つかりません: ${taskId}` });
        }
      }
      const dependency = DependencySchema.parse({ ...input, id: newId(), projectId });
      if (
        findDuplicate(projectId, dependency.predecessorId, dependency.successorId, dependency.type)
      ) {
        return reply.code(409).send({ error: "同じ依存関係が既に存在します" });
      }
      try {
        assertNoCycle(projectId, dependency);
        db.prepare(
          `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
           VALUES (@id, @projectId, @predecessorId, @successorId, @type, @lagDays)`,
        ).run(dependency);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: "同じ依存関係が既に存在します" });
        }
        throw error;
      }
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
    if (updated.predecessorId === updated.successorId) {
      return reply.code(400).send({ error: "自分自身への依存は設定できません" });
    }
    for (const taskId of [updated.predecessorId, updated.successorId]) {
      if (!getTaskInProject(taskId, updated.projectId)) {
        return reply.code(404).send({ error: `タスクが見つかりません: ${taskId}` });
      }
    }
    if (
      findDuplicate(
        updated.projectId,
        updated.predecessorId,
        updated.successorId,
        updated.type,
        updated.id,
      )
    ) {
      return reply.code(409).send({ error: "同じ依存関係が既に存在します" });
    }
    try {
      assertNoCycle(updated.projectId, updated, updated.id);
      db.prepare(
        "UPDATE dependencies SET predecessorId = @predecessorId, successorId = @successorId, type = @type, lagDays = @lagDays WHERE id = @id",
      ).run(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "同じ依存関係が既に存在します" });
      }
      throw error;
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/dependencies/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM dependencies WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "依存関係が見つかりません" });
    return { ok: true };
  });
}
