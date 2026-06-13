import type {
  Baseline,
  BaselineCreateInput,
  BulkTaskInput,
  Dependency,
  DependencyCreateInput,
  ExportBundle,
  Milestone,
  MilestoneCreateInput,
  Project,
  ProjectCreateInput,
  ProjectPlan,
  Risk,
  RiskCreateInput,
  Stakeholder,
  StakeholderCreateInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "@tpc/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError(0, `サーバーに接続できません: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) {
    let message = `エラーが発生しました (HTTP ${res.status})`;
    let issues: ApiError["issues"];
    try {
      const body = await res.json();
      if (typeof body.error === "string") message = body.error;
      issues = body.issues;
    } catch {
      // JSONでないエラーレスポンスはステータスコードのみ伝える
    }
    throw new ApiError(res.status, message, issues);
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const jsonHeaders = { "Content-Type": "application/json" };
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", headers: jsonHeaders, body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export type { BulkTaskInput };

export const api = {
  // プロジェクト
  listProjects: () => get<Project[]>("/api/projects"),
  getProject: (id: string) => get<Project>(`/api/projects/${id}`),
  createProject: (input: ProjectCreateInput) => post<Project>("/api/projects", input),
  updateProject: (id: string, input: Partial<ProjectCreateInput>) =>
    put<Project>(`/api/projects/${id}`, input),
  deleteProject: (id: string) => del<{ ok: true }>(`/api/projects/${id}`),
  getPlan: (id: string) => get<ProjectPlan>(`/api/projects/${id}/plan`),

  // タスク（WBS）
  listTasks: (projectId: string) => get<Task[]>(`/api/projects/${projectId}/tasks`),
  createTask: (projectId: string, input: TaskCreateInput) =>
    post<Task>(`/api/projects/${projectId}/tasks`, input),
  createTasksBulk: (projectId: string, tasks: BulkTaskInput[]) =>
    post<Task[]>(`/api/projects/${projectId}/tasks/bulk`, { tasks }),
  updateTask: (id: string, input: TaskUpdateInput) => put<Task>(`/api/tasks/${id}`, input),
  deleteTask: (id: string) => del<{ ok: true }>(`/api/tasks/${id}`),

  // 依存関係
  listDependencies: (projectId: string) =>
    get<Dependency[]>(`/api/projects/${projectId}/dependencies`),
  createDependency: (projectId: string, input: DependencyCreateInput) =>
    post<Dependency>(`/api/projects/${projectId}/dependencies`, input),
  updateDependency: (id: string, input: Partial<DependencyCreateInput>) =>
    put<Dependency>(`/api/dependencies/${id}`, input),
  deleteDependency: (id: string) => del<{ ok: true }>(`/api/dependencies/${id}`),

  // マイルストーン
  listMilestones: (projectId: string) => get<Milestone[]>(`/api/projects/${projectId}/milestones`),
  createMilestone: (projectId: string, input: MilestoneCreateInput) =>
    post<Milestone>(`/api/projects/${projectId}/milestones`, input),
  updateMilestone: (id: string, input: Partial<MilestoneCreateInput>) =>
    put<Milestone>(`/api/milestones/${id}`, input),
  deleteMilestone: (id: string) => del<{ ok: true }>(`/api/milestones/${id}`),

  // リスク登録簿
  listRisks: (projectId: string) => get<Risk[]>(`/api/projects/${projectId}/risks`),
  createRisk: (projectId: string, input: RiskCreateInput) =>
    post<Risk>(`/api/projects/${projectId}/risks`, input),
  updateRisk: (id: string, input: Partial<RiskCreateInput>) => put<Risk>(`/api/risks/${id}`, input),
  deleteRisk: (id: string) => del<{ ok: true }>(`/api/risks/${id}`),

  // スケジュールベースライン
  listBaselines: (projectId: string) => get<Baseline[]>(`/api/projects/${projectId}/baselines`),
  createBaseline: (projectId: string, input?: BaselineCreateInput) =>
    post<Baseline>(`/api/projects/${projectId}/baselines`, input ?? {}),
  deleteBaseline: (id: string) => del<{ ok: true }>(`/api/baselines/${id}`),

  // エクスポート/インポート
  exportProject: (projectId: string) => get<ExportBundle>(`/api/projects/${projectId}/export`),
  importProject: (bundle: ExportBundle) => post<Project>("/api/projects/import", bundle),

  // ステークホルダー登録簿
  listStakeholders: (projectId: string) =>
    get<Stakeholder[]>(`/api/projects/${projectId}/stakeholders`),
  createStakeholder: (projectId: string, input: StakeholderCreateInput) =>
    post<Stakeholder>(`/api/projects/${projectId}/stakeholders`, input),
  updateStakeholder: (id: string, input: Partial<StakeholderCreateInput>) =>
    put<Stakeholder>(`/api/stakeholders/${id}`, input),
  deleteStakeholder: (id: string) => del<{ ok: true }>(`/api/stakeholders/${id}`),
};
