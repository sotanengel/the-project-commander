import { type Baseline, BaselineCreateSchema, type BaselineTask } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { listBaselines } from "../repositories/baseline.js";
import { loadProjectPlan, projectExists } from "../repositories/project.js";

export default async function baselineRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/baselines",
    async (req, reply) => {
      if (!projectExists(db, req.params.projectId)) {
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      }
      return listBaselines(db, req.params.projectId);
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/baselines",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(db, projectId)) {
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      }
      const input = BaselineCreateSchema.parse(req.body ?? {});
      const plan = loadProjectPlan(db, projectId);
      if (!plan) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
      const snapshot: BaselineTask[] = plan.cpm.tasks.map((s) => ({
        taskId: s.taskId,
        name: taskById.get(s.taskId)?.name ?? "",
        durationDays: taskById.get(s.taskId)?.durationDays ?? 0,
        earlyStart: s.earlyStart,
        earlyFinish: s.earlyFinish,
      }));
      const baseline: Baseline = {
        id: newId(),
        projectId,
        label: input.label,
        createdAt: new Date().toISOString(),
        projectDuration: plan.cpm.projectDuration,
        tasks: snapshot,
      };
      db.prepare(
        "INSERT INTO baselines (id, projectId, label, createdAt, data) VALUES (@id, @projectId, @label, @createdAt, @data)",
      ).run({
        id: baseline.id,
        projectId: baseline.projectId,
        label: baseline.label,
        createdAt: baseline.createdAt,
        data: JSON.stringify({ projectDuration: baseline.projectDuration, tasks: baseline.tasks }),
      });
      reply.code(201);
      return baseline;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/baselines/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM baselines WHERE id = ?").run(req.params.id);
    if (result.changes === 0)
      return reply.code(404).send({ error: "ベースラインが見つかりません" });
    return { ok: true };
  });
}
