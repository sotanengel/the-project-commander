import {
  type Baseline,
  BaselineCreateSchema,
  type BaselineTask,
  type Dependency,
  type Task,
  computeCpm,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

interface BaselineRow {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  data: string;
}

function rowToBaseline(row: BaselineRow): Baseline {
  const data = JSON.parse(row.data) as { projectDuration: number; tasks: BaselineTask[] };
  return {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    createdAt: row.createdAt,
    projectDuration: data.projectDuration,
    tasks: data.tasks,
  };
}

export default async function baselineRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/baselines",
    async (req, reply) => {
      if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(req.params.projectId)) {
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      }
      const rows = db
        .prepare("SELECT * FROM baselines WHERE projectId = ? ORDER BY createdAt DESC")
        .all(req.params.projectId) as BaselineRow[];
      return rows.map(rowToBaseline);
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/baselines",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) {
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });
      }
      const input = BaselineCreateSchema.parse(req.body ?? {});
      const tasks = db.prepare("SELECT * FROM tasks WHERE projectId = ?").all(projectId) as Task[];
      const dependencies = db
        .prepare("SELECT * FROM dependencies WHERE projectId = ?")
        .all(projectId) as Dependency[];
      const cpm = computeCpm(tasks, dependencies);
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const snapshot: BaselineTask[] = cpm.tasks.map((s) => ({
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
        projectDuration: cpm.projectDuration,
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
