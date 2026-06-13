import {
  type BaselineTask,
  CycleError,
  type Dependency,
  type ExportBundle,
  ExportBundleSchema,
  type Milestone,
  ProjectSchema,
  type Risk,
  type Stakeholder,
  type Task,
  topologicalSort,
  validateWbs,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { listBaselineRows, rowToBaseline } from "../repositories/baseline.js";
import { listCommentsByProject } from "../repositories/taskComment.js";

/**
 * インポート時のプロジェクト名を決定する。
 * 既存プロジェクトと重複する場合は「<名前> (インポート)」、
 * それも重複する場合は「<名前> (インポート 2)」… と連番を付与する。
 */
function resolveProjectName(db: Db, name: string): string {
  const exists = (candidate: string): boolean =>
    db.prepare("SELECT 1 FROM projects WHERE name = ?").get(candidate) !== undefined;
  if (!exists(name)) return name;
  let candidate = `${name} (インポート)`;
  for (let n = 2; exists(candidate); n++) {
    candidate = `${name} (インポート ${n})`;
  }
  return candidate;
}

/**
 * プロジェクト一式のエクスポート/インポート。
 * エクスポートは全エンティティ＋ベースラインを含むバンドルを返し、
 * インポートはID再割当のうえ新規プロジェクトとして取り込む。
 */
export default async function exportRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get<{ Params: { id: string } }>("/api/projects/:id/export", async (req, reply) => {
    const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!projectRow) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    const projectId = req.params.id;
    const baselineRows = listBaselineRows(db, projectId).slice().reverse();
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
      baselines: baselineRows.map(rowToBaseline),
      taskComments: listCommentsByProject(db, projectId),
    };
    return bundle;
  });

  app.post("/api/projects/import", async (req, reply) => {
    const bundle = ExportBundleSchema.parse(req.body);

    // WBS構造の検証（通常APIで作成できない不正状態の混入を防ぐ）。
    // missingParentはルート扱いで取り込めるため許容する。
    const wbsIssues = validateWbs(bundle.tasks).issues;
    if (wbsIssues.some((i) => i.type === "duplicateId")) {
      return reply.code(400).send({ error: "バンドル内のタスクIDが重複しています" });
    }
    if (wbsIssues.some((i) => i.type === "cycle")) {
      return reply.code(400).send({ error: "バンドル内のタスクの親子関係が循環しています" });
    }

    // 取り込み対象の依存関係: 両端のタスクがバンドル内に存在するもののみ。
    // 同一(predecessor, successor, type)の重複はUNIQUE制約違反になるためスキップする。
    const bundleTaskIds = new Set(bundle.tasks.map((t) => t.id));
    const seenDepKeys = new Set<string>();
    const effectiveDeps = bundle.dependencies.filter((dep) => {
      if (!bundleTaskIds.has(dep.predecessorId) || !bundleTaskIds.has(dep.successorId)) {
        return false;
      }
      const key = `${dep.predecessorId}>${dep.successorId}:${dep.type}`;
      if (seenDepKeys.has(key)) return false;
      seenDepKeys.add(key);
      return true;
    });
    try {
      // 依存関係の循環（自己依存含む）を検出する。通常APIのassertNoCycleと同等の保証。
      topologicalSort(bundle.tasks, effectiveDeps);
    } catch (error) {
      if (error instanceof CycleError) {
        return reply.code(400).send({ error: "バンドル内の依存関係が循環しています" });
      }
      throw error;
    }

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
        resolveProjectName(db, bundle.project.name),
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
      for (const dep of effectiveDeps) {
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
      const insertBaseline = db.prepare(
        "INSERT INTO baselines (id, projectId, label, createdAt, data) VALUES (?, ?, ?, ?, ?)",
      );
      for (const b of bundle.baselines) {
        // スナップショットのtaskIdを新IDへ再割当。対応タスクが無い行は元のまま保持する。
        const tasks: BaselineTask[] = b.tasks.map((t) => ({
          ...t,
          taskId: idMap.get(t.taskId) ?? t.taskId,
        }));
        insertBaseline.run(
          newId(),
          newProjectId,
          b.label,
          b.createdAt,
          JSON.stringify({ projectDuration: b.projectDuration, tasks }),
        );
      }
      const insertComment = db.prepare(
        "INSERT INTO task_comments (id, taskId, body, createdAt) VALUES (?, ?, ?, ?)",
      );
      for (const comment of bundle.taskComments) {
        const mappedTaskId = idMap.get(comment.taskId);
        if (!mappedTaskId) continue;
        insertComment.run(newId(), mappedTaskId, comment.body, comment.createdAt);
      }
    });
    importTx();

    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(newProjectId);
    reply.code(201);
    return ProjectSchema.parse(project);
  });
}
