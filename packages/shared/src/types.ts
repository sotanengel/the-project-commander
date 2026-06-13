import { z } from "zod";

// ---- 共通 ----
export const LevelSchema = z.enum(["low", "medium", "high"]);
export type Level = z.infer<typeof LevelSchema>;

/** YYYY-MM-DD */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください");

// ---- プロジェクト ----
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "プロジェクト名は必須です"),
  description: z.string().default(""),
  startDate: DateStringSchema,
  createdAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, "プロジェクト名は必須です"),
  description: z.string().min(1, "プロジェクトの概要は必須です"),
  startDate: DateStringSchema,
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

// ---- タスク（WBS要素。子を持たないタスク = ワークパッケージ） ----
export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable().default(null),
  name: z.string().min(1, "タスク名は必須です"),
  description: z.string().default(""),
  /** 所要日数。サマリタスク（子を持つタスク）では子からロールアップされる */
  durationDays: z.number().nonnegative().default(1),
  /** 進捗率 0-100 */
  progress: z.number().min(0).max(100).default(0),
  assignee: z.string().default(""),
  /** 同一親内での表示順 */
  sortOrder: z.number().int().default(0),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskCreateSchema = TaskSchema.omit({ id: true, projectId: true }).partial({
  parentId: true,
  description: true,
  durationDays: true,
  progress: true,
  assignee: true,
  sortOrder: true,
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = TaskCreateSchema.partial();
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

// ---- タスク進捗コメント（時系列履歴） ----
export const TaskCommentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  body: z.string().min(1, "コメントは必須です"),
  createdAt: z.string(),
});
export type TaskComment = z.infer<typeof TaskCommentSchema>;

export const TaskCommentCreateSchema = z.object({
  body: z.string().trim().min(1, "コメントは必須です"),
});
export type TaskCommentCreateInput = z.infer<typeof TaskCommentCreateSchema>;

/** 階層構造のままタスクを一括登録するための入力（AI取り込み・MCP・bulk APIで使用） */
export interface BulkTaskInput {
  name: string;
  description?: string;
  durationDays?: number;
  progress?: number;
  assignee?: string;
  children?: BulkTaskInput[];
}

export const BulkTaskSchema: z.ZodType<BulkTaskInput> = z.object({
  name: z.string().min(1, "タスク名は必須です"),
  description: z.string().optional(),
  durationDays: z.number().nonnegative().optional(),
  progress: z.number().min(0).max(100).optional(),
  assignee: z.string().optional(),
  children: z.lazy(() => z.array(BulkTaskSchema)).optional(),
});

export const BulkBodySchema = z.object({ tasks: z.array(BulkTaskSchema) });

// ---- 依存関係（PMBOK: FS/SS/FF/SF + リード(負のlag)/ラグ） ----
export const DependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);
export type DependencyType = z.infer<typeof DependencyTypeSchema>;

export const DependencySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  predecessorId: z.string(),
  successorId: z.string(),
  type: DependencyTypeSchema.default("FS"),
  /** ラグ日数。負の値はリード */
  lagDays: z.number().default(0),
});
export type Dependency = z.infer<typeof DependencySchema>;

export const DependencyCreateSchema = DependencySchema.omit({ id: true, projectId: true }).partial({
  type: true,
  lagDays: true,
});
export type DependencyCreateInput = z.infer<typeof DependencyCreateSchema>;

// ---- マイルストーン ----
export const MilestoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  dueDate: DateStringSchema,
  status: z.enum(["pending", "done"]).default("pending"),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MilestoneCreateSchema = MilestoneSchema.omit({ id: true, projectId: true }).partial({
  status: true,
});
export type MilestoneCreateInput = z.infer<typeof MilestoneCreateSchema>;

// ---- リスク登録簿 ----
export const RiskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  probability: LevelSchema.default("medium"),
  impact: LevelSchema.default("medium"),
  /** 対応方針 */
  response: z.string().default(""),
  status: z.enum(["open", "watching", "closed"]).default("open"),
});
export type Risk = z.infer<typeof RiskSchema>;

export const RiskCreateSchema = RiskSchema.omit({ id: true, projectId: true }).partial({
  probability: true,
  impact: true,
  response: true,
  status: true,
});
export type RiskCreateInput = z.infer<typeof RiskCreateSchema>;

// ---- ステークホルダー登録簿 ----
export const StakeholderSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  role: z.string().default(""),
  influence: LevelSchema.default("medium"),
  interest: LevelSchema.default("medium"),
  /** 関与方針メモ */
  note: z.string().default(""),
});
export type Stakeholder = z.infer<typeof StakeholderSchema>;

export const StakeholderCreateSchema = StakeholderSchema.omit({
  id: true,
  projectId: true,
}).partial({ role: true, influence: true, interest: true, note: true });
export type StakeholderCreateInput = z.infer<typeof StakeholderCreateSchema>;

// ---- CPM計算結果 ----
export interface ScheduledTask {
  taskId: string;
  /** プロジェクト開始日からの経過日数（0始まり） */
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
}

export interface CpmResult {
  /** ワークパッケージ（葉タスク）のみが対象 */
  tasks: ScheduledTask[];
  /** プロジェクト全体の所要日数 */
  projectDuration: number;
  /** クリティカルパス上のタスクID（earlyStart順） */
  criticalPath: string[];
}

/** プロジェクト計画の集約ビュー（GET /api/projects/:id/plan のレスポンス） */
export interface ProjectPlan {
  project: Project;
  tasks: Task[];
  dependencies: Dependency[];
  milestones: Milestone[];
  cpm: CpmResult;
}

// ---- スケジュールベースライン（PMBOK: 承認版スケジュールのスナップショット） ----
export const BaselineTaskSchema = z.object({
  taskId: z.string(),
  name: z.string(),
  durationDays: z.number(),
  /** 保存時点のCPM早期開始/終了（プロジェクト開始からの経過日数） */
  earlyStart: z.number(),
  earlyFinish: z.number(),
});
export type BaselineTask = z.infer<typeof BaselineTaskSchema>;

export const BaselineSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  label: z.string().default(""),
  createdAt: z.string(),
  /** 保存時点のプロジェクト全体所要日数 */
  projectDuration: z.number(),
  /** 保存時点のワークパッケージ（葉タスク）スナップショット */
  tasks: z.array(BaselineTaskSchema),
});
export type Baseline = z.infer<typeof BaselineSchema>;

export const BaselineCreateSchema = z.object({
  label: z.string().default(""),
});
export type BaselineCreateInput = z.infer<typeof BaselineCreateSchema>;

// ---- プロジェクトのエクスポート/インポート ----
export const ExportBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  project: ProjectSchema,
  tasks: z.array(TaskSchema),
  dependencies: z.array(DependencySchema),
  milestones: z.array(MilestoneSchema),
  risks: z.array(RiskSchema),
  stakeholders: z.array(StakeholderSchema),
  baselines: z.array(BaselineSchema).default([]),
  taskComments: z.array(TaskCommentSchema).default([]),
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
