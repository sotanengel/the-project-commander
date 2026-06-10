import {
  type Dependency,
  type ExportBundle,
  ExportBundleSchema,
  type Milestone,
  ProjectSchema,
  type Risk,
  type Stakeholder,
  type Task,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

/**
 * プロジェクト一式のエクスポート/インポート。
 * 暫定版（基盤2の最小実装）: バリデーション強化・テストはユニット6で拡充する。
 */
export default async function exportRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { id: string } }>("/api/projects/:id/export", async (req, reply) => {
    const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!projectRow) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    const projectId = req.params.id;
    const baselineRows = db
      .prepare("SELECT * FROM baselines WHERE projectId = ? ORDER BY createdAt")
      .all(projectId) as Array<{
      id: string;
      projectId: string;
      label: string;
      createdAt: string;
      data: string;
    }>;
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: ProjectSchema.parse(projectRow),
      tasks: db
        .prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder")
        .all(projectId) as Task[],
      dependencies: db
        .prepare("SELECT * FROM dependencies WHERE projectId = ?")
        .all(projectId) as Dependency[],
      milestones: db
        .prepare("SELECT * FROM milestones WHERE projectId = ?")
        .all(projectId) as Milestone[],
      risks: db.prepare("SELECT * FROM risks WHERE projectId = ?").all(projectId) as Risk[],
      stakeholders: db
        .prepare("SELECT * FROM stakeholders WHERE projectId = ?")
        .all(projectId) as Stakeholder[],
      baselines: baselineRows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        label: row.label,
        createdAt: row.createdAt,
        ...(JSON.parse(row.data) as { projectDuration: number; tasks: [] }),
      })),
    };
    return bundle;
  });

  app.post("/api/projects/import", async (req, reply) => {
    const bundle = ExportBundleSchema.parse(req.body);
    const newProjectId = newId();
    const idMap = new Map<string, string>();
    for (const task of bundle.tasks) {
      idMap.set(task.id, newId());
    }

    const importTx = db.transaction(() => {
      db.prepare(
        "INSERT INTO projects (id, name, description, startDate, createdAt) VALUES (?, ?, ?, ?, ?)",
      ).run(
        newProjectId,
        bundle.project.name,
        bundle.project.description,
        bundle.project.startDate,
        new Date().toISOString(),
      );
      const insertTask = db.prepare(
        `INSERT INTO tasks (id, projectId, parentId, name, description, durationDays, progress, assignee, sortOrder)
         VALUES (@id, @projectId, @parentId, @name, @description, @durationDays, @progress, @assignee, @sortOrder)`,
      );
      for (const task of bundle.tasks) {
        insertTask.run({
          ...task,
          id: idMap.get(task.id),
          projectId: newProjectId,
          parentId: task.parentId ? (idMap.get(task.parentId) ?? null) : null,
        });
      }
      const insertDep = db.prepare(
        `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const dep of bundle.dependencies) {
        const pred = idMap.get(dep.predecessorId);
        const succ = idMap.get(dep.successorId);
        if (!pred || !succ) continue;
        insertDep.run(newId(), newProjectId, pred, succ, dep.type, dep.lagDays);
      }
      const insertMilestone = db.prepare(
        "INSERT INTO milestones (id, projectId, name, dueDate, status) VALUES (?, ?, ?, ?, ?)",
      );
      for (const m of bundle.milestones) {
        insertMilestone.run(newId(), newProjectId, m.name, m.dueDate, m.status);
      }
      const insertRisk = db.prepare(
        `INSERT INTO risks (id, projectId, title, probability, impact, response, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of bundle.risks) {
        insertRisk.run(
          newId(),
          newProjectId,
          r.title,
          r.probability,
          r.impact,
          r.response,
          r.status,
        );
      }
      const insertStakeholder = db.prepare(
        `INSERT INTO stakeholders (id, projectId, name, role, influence, interest, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of bundle.stakeholders) {
        insertStakeholder.run(
          newId(),
          newProjectId,
          s.name,
          s.role,
          s.influence,
          s.interest,
          s.note,
        );
      }
    });
    importTx();

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(newProjectId);
    reply.code(201);
    return ProjectSchema.parse(project);
  });
}
