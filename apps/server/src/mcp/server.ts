import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type Baseline,
  type BaselineTask,
  type Dependency,
  DependencyCreateSchema,
  DependencySchema,
  type ExportBundle,
  type Milestone,
  MilestoneCreateSchema,
  MilestoneSchema,
  type Project,
  ProjectCreateSchema,
  type ProjectPlan,
  ProjectSchema,
  type Risk,
  RiskCreateSchema,
  RiskSchema,
  type Stakeholder,
  StakeholderCreateSchema,
  StakeholderSchema,
  type Task,
  TaskSchema,
  TaskUpdateSchema,
  topologicalSort,
} from "@tpc/shared";
import { z } from "zod";
import { type Db, newId } from "../db.js";
import { loadProjectPlan, projectExists } from "../repositories/project.js";
import { BulkTaskSchema, createTaskRepository, getTask } from "../repositories/task.js";
import { listCommentsByProject } from "../repositories/taskComment.js";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function toolError(message: string): never {
  throw new Error(message);
}

export function createMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: "the-project-commander", version: "0.1.0" });
  const { insertTaskTree } = createTaskRepository(db);

  function ensureProject(projectId: string): void {
    if (!projectExists(db, projectId)) toolError("プロジェクトが見つかりません");
  }

  function requirePlan(projectId: string): ProjectPlan {
    const plan = loadProjectPlan(db, projectId);
    if (!plan) toolError("プロジェクトが見つかりません");
    return plan;
  }

  server.registerTool(
    "list_projects",
    { description: "登録済みプロジェクト一覧を返す" },
    async () => {
      const rows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC").all();
      return jsonContent(rows.map((r) => ProjectSchema.parse(r)));
    },
  );

  server.registerTool(
    "create_project",
    {
      description: "新しいプロジェクトを作成する",
      inputSchema: {
        name: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const input = ProjectCreateSchema.parse(args);
        const project: Project = {
          id: newId(),
          name: input.name,
          description: input.description ?? "",
          startDate: input.startDate,
          createdAt: new Date().toISOString(),
        };
        db.prepare(
          "INSERT INTO projects (id, name, description, startDate, createdAt) VALUES (@id, @name, @description, @startDate, @createdAt)",
        ).run(project);
        return jsonContent(project);
      } catch (e) {
        toolError(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_project_plan",
    {
      description: "プロジェクト計画（タスク・依存・マイルストーン・CPM）を返す",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      ensureProject(projectId);
      return jsonContent(requirePlan(projectId));
    },
  );

  server.registerTool(
    "add_tasks",
    {
      description: "階層構造のタスクを一括登録する",
      inputSchema: {
        projectId: z.string(),
        tasks: z.array(BulkTaskSchema),
      },
    },
    async ({ projectId, tasks }) => {
      ensureProject(projectId);
      const created = db.transaction(() => insertTaskTree(projectId, tasks, null))();
      return jsonContent(created);
    },
  );

  server.registerTool(
    "update_task",
    {
      description: "タスクを部分更新する",
      inputSchema: {
        taskId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        durationDays: z.number().nonnegative().optional(),
        progress: z.number().min(0).max(100).optional(),
        assignee: z.string().optional(),
        parentId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      },
    },
    async ({ taskId, ...fields }) => {
      const existing = getTask(db, taskId);
      if (!existing) toolError("タスクが見つかりません");
      const input = TaskUpdateSchema.parse(fields);
      const updated = TaskSchema.parse({ ...existing, ...input });
      db.prepare(
        `UPDATE tasks SET parentId = @parentId, name = @name, description = @description,
         durationDays = @durationDays, progress = @progress, assignee = @assignee, sortOrder = @sortOrder
         WHERE id = @id`,
      ).run(updated);
      return jsonContent(updated);
    },
  );

  server.registerTool(
    "delete_task",
    {
      description: "タスクを削除する（子孫・関連依存もカスケード削除）",
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) => {
      const existing = getTask(db, taskId);
      if (!existing) toolError("タスクが見つかりません");
      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    "set_dependencies",
    {
      description: "依存関係を一括登録する（重複はスキップ、循環時は全ロールバック）",
      inputSchema: {
        projectId: z.string(),
        dependencies: z.array(
          z.object({
            predecessorId: z.string(),
            successorId: z.string(),
            type: z.enum(["FS", "SS", "FF", "SF"]).optional(),
            lagDays: z.number().optional(),
          }),
        ),
      },
    },
    async ({ projectId, dependencies }) => {
      ensureProject(projectId);

      const result = db.transaction(() => {
        const created: Dependency[] = [];
        let skipped = 0;
        const pending: Dependency[] = [];

        for (const raw of dependencies) {
          const input = DependencyCreateSchema.parse(raw);
          if (input.predecessorId === input.successorId) {
            toolError("自分自身への依存は設定できません");
          }
          for (const taskId of [input.predecessorId, input.successorId]) {
            const row = db
              .prepare("SELECT 1 FROM tasks WHERE id = ? AND projectId = ?")
              .get(taskId, projectId);
            if (!row) toolError(`タスクが見つかりません: ${taskId}`);
          }
          const dep = DependencySchema.parse({ ...input, id: newId(), projectId });
          const dupInDb = db
            .prepare(
              `SELECT 1 FROM dependencies
               WHERE projectId = ? AND predecessorId = ? AND successorId = ? AND type = ?`,
            )
            .get(projectId, dep.predecessorId, dep.successorId, dep.type);
          const dupInBatch = pending.some(
            (p) =>
              p.predecessorId === dep.predecessorId &&
              p.successorId === dep.successorId &&
              p.type === dep.type,
          );
          if (dupInDb || dupInBatch) {
            skipped++;
            continue;
          }
          pending.push(dep);
        }

        const tasks = db
          .prepare("SELECT * FROM tasks WHERE projectId = ?")
          .all(projectId) as Task[];
        const existing = db
          .prepare("SELECT * FROM dependencies WHERE projectId = ?")
          .all(projectId) as Dependency[];
        try {
          topologicalSort(tasks, [...existing, ...pending]);
        } catch (e) {
          toolError(e instanceof Error ? e.message : "依存関係に循環があります");
        }

        for (const dep of pending) {
          db.prepare(
            `INSERT INTO dependencies (id, projectId, predecessorId, successorId, type, lagDays)
             VALUES (@id, @projectId, @predecessorId, @successorId, @type, @lagDays)`,
          ).run(dep);
          created.push(dep);
        }
        return { created, skipped };
      })();

      return jsonContent(result);
    },
  );

  server.registerTool(
    "get_critical_path",
    {
      description: "クリティカルパスと各タスクのフロート情報を返す",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      ensureProject(projectId);
      const plan = requirePlan(projectId);
      const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
      const scheduledById = new Map(plan.cpm.tasks.map((s) => [s.taskId, s]));
      const tasks = plan.tasks
        .filter((t) => scheduledById.has(t.id))
        .map((t) => {
          const s = scheduledById.get(t.id);
          if (!s) return null;
          return {
            id: t.id,
            name: t.name,
            earlyStart: s.earlyStart,
            earlyFinish: s.earlyFinish,
            totalFloat: s.totalFloat,
            freeFloat: s.freeFloat,
            isCritical: s.isCritical,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const criticalPath = plan.cpm.criticalPath.map((id) => ({
        id,
        name: taskById.get(id)?.name ?? id,
      }));
      return jsonContent({
        projectDuration: plan.cpm.projectDuration,
        criticalPath,
        tasks,
      });
    },
  );

  server.registerTool(
    "add_risks",
    {
      description: "リスクを一括登録する",
      inputSchema: {
        projectId: z.string(),
        risks: z.array(
          z.object({
            title: z.string().min(1),
            probability: z.enum(["low", "medium", "high"]).optional(),
            impact: z.enum(["low", "medium", "high"]).optional(),
            response: z.string().optional(),
            status: z.enum(["open", "watching", "closed"]).optional(),
          }),
        ),
      },
    },
    async ({ projectId, risks }) => {
      ensureProject(projectId);
      const insert = db.prepare(
        `INSERT INTO risks (id, projectId, title, probability, impact, response, status)
         VALUES (@id, @projectId, @title, @probability, @impact, @response, @status)`,
      );
      const created: Risk[] = [];
      for (const raw of risks) {
        const input = RiskCreateSchema.parse(raw);
        const risk = RiskSchema.parse({ ...input, id: newId(), projectId });
        insert.run(risk);
        created.push(risk);
      }
      return jsonContent(created);
    },
  );

  server.registerTool(
    "add_milestones",
    {
      description:
        "プロジェクトにマイルストーンを一括登録する。各要素は name（マイルストーン名）と dueDate（期日、YYYY-MM-DD形式）が必須で、status（pending=未達成 / done=達成済み、省略時はpending）を任意指定できる。登録したマイルストーンの一覧を返す。",
      inputSchema: {
        projectId: z.string(),
        milestones: z.array(
          z.object({
            name: z.string().min(1),
            dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            status: z.enum(["pending", "done"]).optional(),
          }),
        ),
      },
    },
    async ({ projectId, milestones }) => {
      ensureProject(projectId);
      const created = db.transaction(() => {
        const insert = db.prepare(
          "INSERT INTO milestones (id, projectId, name, dueDate, status) VALUES (@id, @projectId, @name, @dueDate, @status)",
        );
        const rows: Milestone[] = [];
        for (const raw of milestones) {
          const input = MilestoneCreateSchema.parse(raw);
          const milestone = MilestoneSchema.parse({ ...input, id: newId(), projectId });
          insert.run(milestone);
          rows.push(milestone);
        }
        return rows;
      })();
      return jsonContent(created);
    },
  );

  server.registerTool(
    "add_stakeholders",
    {
      description:
        "プロジェクトにステークホルダー（利害関係者）を一括登録する。各要素は name（氏名・組織名）が必須で、role（役割。例: スポンサー、顧客）、influence（影響度: low/medium/high、省略時はmedium）、interest（関心度: low/medium/high、省略時はmedium）、note（関与方針メモ）を任意指定できる。登録したステークホルダーの一覧を返す。",
      inputSchema: {
        projectId: z.string(),
        stakeholders: z.array(
          z.object({
            name: z.string().min(1),
            role: z.string().optional(),
            influence: z.enum(["low", "medium", "high"]).optional(),
            interest: z.enum(["low", "medium", "high"]).optional(),
            note: z.string().optional(),
          }),
        ),
      },
    },
    async ({ projectId, stakeholders }) => {
      ensureProject(projectId);
      const created = db.transaction(() => {
        const insert = db.prepare(
          `INSERT INTO stakeholders (id, projectId, name, role, influence, interest, note)
           VALUES (@id, @projectId, @name, @role, @influence, @interest, @note)`,
        );
        const rows: Stakeholder[] = [];
        for (const raw of stakeholders) {
          const input = StakeholderCreateSchema.parse(raw);
          const stakeholder = StakeholderSchema.parse({ ...input, id: newId(), projectId });
          insert.run(stakeholder);
          rows.push(stakeholder);
        }
        return rows;
      })();
      return jsonContent(created);
    },
  );

  server.registerTool(
    "list_risks",
    {
      description:
        "プロジェクトのリスク登録簿（リスク一覧）を返す。各リスクは title（タイトル）、probability（発生確率: low/medium/high）、impact（影響度: low/medium/high）、response（対応方針）、status（状態: open=対応中 / watching=監視中 / closed=完了）を持つ。",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      ensureProject(projectId);
      const rows = db.prepare("SELECT * FROM risks WHERE projectId = ?").all(projectId) as Risk[];
      return jsonContent(rows.map((r) => RiskSchema.parse(r)));
    },
  );

  server.registerTool(
    "create_baseline",
    {
      description:
        "現在のプロジェクト計画のスケジュールベースライン（承認版スナップショット）を保存する。現時点のタスク・依存関係からCPM（クリティカルパス法）を計算し、プロジェクト全体所要日数と各ワークパッケージの早期開始/終了日をスナップショットとして記録する。label（ベースライン名。例: 承認版v1）を任意指定できる。後から実績と比較して計画乖離を分析するために使う。結果として保存したベースラインのID・projectDuration（全体所要日数）・taskCount（スナップショットに含まれるタスク数）を返す。",
      inputSchema: {
        projectId: z.string(),
        label: z.string().optional(),
      },
    },
    async ({ projectId, label }) => {
      ensureProject(projectId);
      const plan = requirePlan(projectId);
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
        label: label ?? "",
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
      return jsonContent({
        id: baseline.id,
        projectId: baseline.projectId,
        label: baseline.label,
        createdAt: baseline.createdAt,
        projectDuration: baseline.projectDuration,
        taskCount: baseline.tasks.length,
      });
    },
  );

  server.registerTool(
    "export_project",
    {
      description:
        "プロジェクト一式（プロジェクト情報・タスク・依存関係・マイルストーン・リスク・ステークホルダー・ベースライン）をExportBundle形式のJSONとして出力する。生成AIがプロジェクト全体を一度に読み取って状況分析・レポート作成・別ツールへのデータ引き継ぎ（インポート）を行う用途に使える。",
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
      if (!projectRow) toolError("プロジェクトが見つかりません");
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
          ...(JSON.parse(row.data) as { projectDuration: number; tasks: BaselineTask[] }),
        })),
        taskComments: listCommentsByProject(db, projectId),
      };
      return jsonContent(bundle);
    },
  );

  return server;
}
