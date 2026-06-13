import { addDays } from "@tpc/shared";
import type { Dependency, ProjectPlan, ScheduledTask, Task, TaskCreateInput } from "@tpc/shared";
import type { TaskEditDraft } from "../wbs/wbsViewModel.js";
import { validateTaskEdit } from "../wbs/wbsViewModel.js";

export interface LinkedTask {
  id: string;
  name: string;
}

export interface TaskDetailView {
  task: Task;
  isLeaf: boolean;
  breadcrumb: string[];
  children: LinkedTask[];
  predecessors: LinkedTask[];
  successors: LinkedTask[];
  schedule: ScheduledTask | null;
  startDateLabel: string | null;
  finishDateLabel: string | null;
}

/** タスクが葉（ワークパッケージ）かどうか */
export function isLeafTask(tasks: Task[], taskId: string): boolean {
  return !tasks.some((t) => t.parentId === taskId);
}

/** 親を辿ってルートからタスク名のパンくずを構築 */
export function buildTaskBreadcrumb(tasks: Task[], taskId: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const names: string[] = [];
  let current = byId.get(taskId);
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names;
}

/** 直接の子タスクを sortOrder 順で返す */
export function listChildTasks(tasks: Task[], parentId: string): LinkedTask[] {
  return tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ id: t.id, name: t.name }));
}

function resolveLinkedTasks(
  tasks: Task[],
  dependencies: Dependency[],
  taskId: string,
  direction: "predecessors" | "successors",
): LinkedTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids =
    direction === "predecessors"
      ? dependencies.filter((d) => d.successorId === taskId).map((d) => d.predecessorId)
      : dependencies.filter((d) => d.predecessorId === taskId).map((d) => d.successorId);

  return ids
    .map((id) => {
      const task = byId.get(id);
      return task ? { id: task.id, name: task.name } : null;
    })
    .filter((t): t is LinkedTask => t !== null);
}

/** プロジェクト計画からタスク詳細表示用データを組み立てる */
export function buildTaskDetailView(plan: ProjectPlan, taskId: string): TaskDetailView | null {
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const schedule = plan.cpm.tasks.find((s) => s.taskId === taskId) ?? null;
  const leaf = isLeafTask(plan.tasks, taskId);

  let startDateLabel: string | null = null;
  let finishDateLabel: string | null = null;
  if (schedule) {
    startDateLabel = addDays(plan.project.startDate, schedule.earlyStart);
    finishDateLabel = addDays(
      plan.project.startDate,
      Math.max(schedule.earlyFinish - 1, schedule.earlyStart),
    );
  }

  return {
    task,
    isLeaf: leaf,
    breadcrumb: buildTaskBreadcrumb(plan.tasks, taskId),
    children: listChildTasks(plan.tasks, taskId),
    predecessors: resolveLinkedTasks(plan.tasks, plan.dependencies, taskId, "predecessors"),
    successors: resolveLinkedTasks(plan.tasks, plan.dependencies, taskId, "successors"),
    schedule,
    startDateLabel,
    finishDateLabel,
  };
}

/** 担当者表示ラベル（空なら未設定） */
export function formatAssignee(assignee: string): string {
  const trimmed = assignee.trim();
  return trimmed.length > 0 ? trimmed : "未設定";
}

/** タスク詳細の新規作成モードかどうか */
export function isTaskCreateMode(taskId: string | undefined): boolean {
  return taskId === "new";
}

/** 削除確認ダイアログのメッセージ */
export function buildTaskDeleteConfirmMessage(taskName: string, childCount: number): string {
  const base = `タスク「${taskName}」を削除しますか？`;
  if (childCount <= 0) return `${base} この操作は取り消せません。`;
  return `${base} 子タスク ${childCount} 件もまとめて削除されます。この操作は取り消せません。`;
}

/** 作成モードのパンくず（親パンくず + 「新規」） */
export function buildCreateModeBreadcrumb(parentBreadcrumb: string[]): string[] {
  return [...parentBreadcrumb, "新規"];
}

export interface TaskCreateFormDraft extends TaskEditDraft {
  description: string;
  assignee: string;
}

export type TaskCreateInputResult =
  | { ok: true; value: TaskCreateInput }
  | { ok: false; errors: string[] };

/** フォーム値から createTask 用ペイロードを組み立てる */
export function buildTaskCreateInput(
  draft: TaskCreateFormDraft,
  parentId: string,
): TaskCreateInputResult {
  const result = validateTaskEdit({
    name: draft.name,
    duration: draft.duration,
    progress: draft.progress,
  });
  if (!result.ok) {
    return { ok: false, errors: Object.values(result.errors).filter(Boolean) as string[] };
  }
  return {
    ok: true,
    value: {
      name: result.value.name,
      description: draft.description.trim(),
      assignee: draft.assignee.trim(),
      durationDays: result.value.durationDays,
      progress: result.value.progress ?? 0,
      parentId,
    },
  };
}
