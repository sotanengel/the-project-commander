import { type Stakeholder, StakeholderCreateSchema, StakeholderSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { projectExists } from "../repositories/project.js";

export default async function stakeholderRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/stakeholders",
    async (req, reply) => {
      if (!projectExists(db, req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      return db
        .prepare("SELECT * FROM stakeholders WHERE projectId = ?")
        .all(req.params.projectId) as Stakeholder[];
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/stakeholders",
    async (req, reply) => {
      if (!projectExists(db, req.params.projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const input = StakeholderCreateSchema.parse(req.body);
      const stakeholder = StakeholderSchema.parse({
        ...input,
        id: newId(),
        projectId: req.params.projectId,
      });
      db.prepare(
        `INSERT INTO stakeholders (id, projectId, name, role, influence, interest, note)
         VALUES (@id, @projectId, @name, @role, @influence, @interest, @note)`,
      ).run(stakeholder);
      reply.code(201);
      return stakeholder;
    },
  );

  app.put<{ Params: { id: string } }>("/api/stakeholders/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM stakeholders WHERE id = ?").get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "ステークホルダーが見つかりません" });
    const input = StakeholderCreateSchema.partial().parse(req.body);
    const updated = StakeholderSchema.parse({ ...existing, ...input });
    db.prepare(
      `UPDATE stakeholders SET name = @name, role = @role, influence = @influence,
       interest = @interest, note = @note WHERE id = @id`,
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/stakeholders/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM stakeholders WHERE id = ?").run(req.params.id);
    if (result.changes === 0)
      return reply.code(404).send({ error: "ステークホルダーが見つかりません" });
    return { ok: true };
  });
}
