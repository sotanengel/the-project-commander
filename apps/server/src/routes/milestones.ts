import { type Milestone, MilestoneCreateSchema, MilestoneSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

export default async function milestoneRoutes(app: FastifyInstance, { db }: { db: Db }) {
  function projectExists(projectId: string): boolean {
    return db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
  }

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/milestones",
    async (req, reply) => {
      if (!projectExists(req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      return db
        .prepare("SELECT * FROM milestones WHERE projectId = ? ORDER BY dueDate")
        .all(req.params.projectId) as Milestone[];
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/milestones",
    async (req, reply) => {
      if (!projectExists(req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const input = MilestoneCreateSchema.parse(req.body);
      const milestone = MilestoneSchema.parse({
        ...input,
        id: newId(),
        projectId: req.params.projectId,
      });
      db.prepare(
        "INSERT INTO milestones (id, projectId, name, dueDate, status) VALUES (@id, @projectId, @name, @dueDate, @status)",
      ).run(milestone);
      reply.code(201);
      return milestone;
    },
  );

  app.put<{ Params: { id: string } }>("/api/milestones/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM milestones WHERE id = ?").get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "マイルストーンが見つかりません" });
    const input = MilestoneCreateSchema.partial().parse(req.body);
    const updated = MilestoneSchema.parse({ ...existing, ...input });
    db.prepare(
      "UPDATE milestones SET name = @name, dueDate = @dueDate, status = @status WHERE id = @id",
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/milestones/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM milestones WHERE id = ?").run(req.params.id);
    if (result.changes === 0)
      return reply.code(404).send({ error: "マイルストーンが見つかりません" });
    return { ok: true };
  });
}
