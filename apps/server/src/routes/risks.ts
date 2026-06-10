import { type Risk, RiskCreateSchema, RiskSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

export default async function riskRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/risks", async (req) => {
    return db
      .prepare("SELECT * FROM risks WHERE projectId = ?")
      .all(req.params.projectId) as Risk[];
  });

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/risks",
    async (req, reply) => {
      const input = RiskCreateSchema.parse(req.body);
      const risk = RiskSchema.parse({ ...input, id: newId(), projectId: req.params.projectId });
      db.prepare(
        `INSERT INTO risks (id, projectId, title, probability, impact, response, status)
         VALUES (@id, @projectId, @title, @probability, @impact, @response, @status)`,
      ).run(risk);
      reply.code(201);
      return risk;
    },
  );

  app.put<{ Params: { id: string } }>("/api/risks/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM risks WHERE id = ?").get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "リスクが見つかりません" });
    const input = RiskCreateSchema.partial().parse(req.body);
    const updated = RiskSchema.parse({ ...existing, ...input });
    db.prepare(
      `UPDATE risks SET title = @title, probability = @probability, impact = @impact,
       response = @response, status = @status WHERE id = @id`,
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/risks/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM risks WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return reply.code(404).send({ error: "リスクが見つかりません" });
    return { ok: true };
  });
}
