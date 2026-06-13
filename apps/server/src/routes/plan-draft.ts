import {
  CycleError,
  DependencySchema,
  MilestoneSchema,
  PlanDraftSchema,
  RiskSchema,
  StakeholderSchema,
  resolveDependenciesByName,
  topologicalSort,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";
import { projectExists } from "../repositories/project.js";
import { createTaskRepository, listTasks } from "../repositories/task.js";

export interface PlanDraftImportSummary {
  tasksCreated: number;
  dependencies: {
    succeeded: number;
    failed: number;
    failures: { label: string; reason: string }[];
  };
  milestones: number;
  risks: number;
  stakeholders: number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export default async function planDraftRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const { insertTaskTree } = createTaskRepository(db);

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/plan-draft-import",
    async (req, reply) => {
      const { projectId } = req.params;
      if (!projectExists(db, projectId))
        return reply.code(404).send({ error: "プロジェクトが見つかりません" });

      const draft = PlanDraftSchema.parse(req.body);

      try {
        const summary = db.transaction(() => {
          insertTaskTree(projectId, draft.tasks, null);
          const tasks = listTasks(db, projectId);
          const parentIds = new Set(
            tasks.map((t) => t.parentId).filter((p): p is string => p !== null),
          );
          const leaves = tasks.filter((t) => !parentIds.has(t.id));

          const depResolution = resolveDependenciesByName(draft.dependencies, leaves);
          const depFailures: { label: string; reason: string }[] = [...depResolution.failures];

          const existingDeps = (
            db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId) as Array<{
              id: string;
              projectId: string;
              predecessorId: string;
              successorId: string;
              type: string;
              lagDays: number;
            }>
          ).map((row) => DependencySchema.parse(row));

          const candidateDeps = depResolution.resolved.map((dep) =>
            DependencySchema.parse({
              id: newId(),
              projectId,
              predecessorId: dep.input.predecessorId,
              successorId: dep.input.successorId,
              type: dep.input.type ?? "FS",
              lagDays: dep.input.lagDays ?? 0,
            }),
          );

          if (candidateDeps.length > 0) {
            topologicalSort(leaves, [...existingDeps, ...candidateDeps]);
          }

          const insertDep = db.prepare(
            `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
             VALUES (@id, @projectId, @predecessorId, @successorId, @type, @lagDays)`,
          );

          let depSucceeded = 0;
          for (const candidate of candidateDeps) {
            try {
              insertDep.run(candidate);
              depSucceeded++;
            } catch (e) {
              depFailures.push({
                label: `${candidate.predecessorId} → ${candidate.successorId}`,
                reason: isUniqueViolation(e)
                  ? "同じ依存関係が既に存在します"
                  : e instanceof Error
                    ? e.message
                    : "不明なエラー",
              });
            }
          }

          const insertMilestone = db.prepare(
            "INSERT INTO milestones (id, projectId, name, dueDate, status) VALUES (@id, @projectId, @name, @dueDate, @status)",
          );
          for (const m of draft.milestones) {
            const milestone = MilestoneSchema.parse({
              ...m,
              id: newId(),
              projectId,
              status: m.status ?? "pending",
            });
            insertMilestone.run(milestone);
          }

          const insertRisk = db.prepare(
            `INSERT INTO risks (id, projectId, title, probability, impact, response, status)
             VALUES (@id, @projectId, @title, @probability, @impact, @response, @status)`,
          );
          for (const r of draft.risks) {
            const risk = RiskSchema.parse({
              ...r,
              id: newId(),
              projectId,
              probability: r.probability ?? "medium",
              impact: r.impact ?? "medium",
              status: "open",
            });
            insertRisk.run(risk);
          }

          const insertStakeholder = db.prepare(
            `INSERT INTO stakeholders (id, projectId, name, role, influence, interest, note)
             VALUES (@id, @projectId, @name, @role, @influence, @interest, @note)`,
          );
          for (const s of draft.stakeholders) {
            const stakeholder = StakeholderSchema.parse({
              ...s,
              id: newId(),
              projectId,
              role: s.role ?? "",
              influence: s.influence ?? "medium",
              interest: s.interest ?? "medium",
              note: s.note ?? "",
            });
            insertStakeholder.run(stakeholder);
          }

          return {
            tasksCreated: tasks.length,
            dependencies: {
              succeeded: depSucceeded,
              failed: depFailures.length,
              failures: depFailures,
            },
            milestones: draft.milestones.length,
            risks: draft.risks.length,
            stakeholders: draft.stakeholders.length,
          } satisfies PlanDraftImportSummary;
        })();

        reply.code(201);
        return summary;
      } catch (e) {
        if (e instanceof CycleError) {
          return reply.code(409).send({ error: e.message });
        }
        if (isUniqueViolation(e)) {
          return reply.code(409).send({ error: "依存関係が重複しています" });
        }
        throw e;
      }
    },
  );
}
