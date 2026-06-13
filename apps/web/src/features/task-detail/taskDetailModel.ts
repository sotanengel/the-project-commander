import { addDays } from "@tpc/shared";
import type { Dependency, ProjectPlan, ScheduledTask, Task } from "@tpc/shared";

export interface LinkedTask {
  id: string;
  name: string;
}

export interface TaskDetailView {
  task: Task;
  isLeaf: boolean;
  breadcrumb: string[];
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
