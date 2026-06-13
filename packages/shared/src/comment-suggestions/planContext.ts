import type { ProjectPlan, ScheduledTask, Task } from "../types.js";

export const DEFAULT_PLAN_CONTEXT_TASK_LIMIT = 80;

export interface PlanContextOptions {
  targetTaskId: string;
  taskLimit?: number;
}

function scheduledByTaskId(plan: ProjectPlan): Map<string, ScheduledTask> {
  const map = new Map<string, ScheduledTask>();
  for (const s of plan.cpm.tasks) {
    map.set(s.taskId, s);
  }
  return map;
}

/** 対象タスク周辺（親子・依存）を優先してタスク ID を選ぶ */
export function selectTaskIdsForContext(
  plan: ProjectPlan,
  targetTaskId: string,
  limit: number,
): Set<string> {
  const selected = new Set<string>();
  if (!plan.tasks.some((t) => t.id === targetTaskId)) {
    return selected;
  }

  const add = (id: string) => {
    if (selected.size < limit) selected.add(id);
  };

  add(targetTaskId);

  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  const target = taskById.get(targetTaskId);
  if (target?.parentId) add(target.parentId);

  for (const t of plan.tasks) {
    if (t.parentId === targetTaskId) add(t.id);
  }

  for (const d of plan.dependencies) {
    if (d.predecessorId === targetTaskId) add(d.successorId);
    if (d.successorId === targetTaskId) add(d.predecessorId);
  }

  for (const t of plan.tasks) {
    add(t.id);
    if (selected.size >= limit) break;
  }

  return selected;
}

function formatTaskLine(task: Task, scheduled: ScheduledTask | undefined): string {
  const schedule =
    scheduled !== undefined
      ? `ES=${scheduled.earlyStart} EF=${scheduled.earlyFinish} critical=${scheduled.isCritical}`
      : "schedule=n/a";
  return [
    `id=${task.id}`,
    `name=${task.name}`,
    `durationDays=${task.durationDays}`,
    `progress=${task.progress}`,
    `assignee=${task.assignee || "(none)"}`,
    schedule,
  ].join(" | ");
}

/** ProjectPlan をローカル LLM 向けのテキストに直列化する */
export function serializePlanContext(plan: ProjectPlan, options: PlanContextOptions): string {
  const limit = options.taskLimit ?? DEFAULT_PLAN_CONTEXT_TASK_LIMIT;
  const selectedIds = selectTaskIdsForContext(plan, options.targetTaskId, limit);
  const scheduled = scheduledByTaskId(plan);

  const taskLines = plan.tasks
    .filter((t) => selectedIds.has(t.id))
    .map((t) => formatTaskLine(t, scheduled.get(t.id)));

  const omitted = plan.tasks.length - taskLines.length;

  const depLines = plan.dependencies.map(
    (d) =>
      `predecessorId=${d.predecessorId} successorId=${d.successorId} type=${d.type} lagDays=${d.lagDays}`,
  );

  const milestoneLines = plan.milestones.map(
    (m) => `id=${m.id} name=${m.name} dueDate=${m.dueDate} status=${m.status}`,
  );

  const lines = [
    `project: id=${plan.project.id} name=${plan.project.name} startDate=${plan.project.startDate}`,
    `projectDuration=${plan.cpm.projectDuration}`,
    `criticalPath=${plan.cpm.criticalPath.join(",") || "(none)"}`,
    "",
    "## タスク（id を変更提案で使用すること）",
    ...taskLines,
  ];

  if (omitted > 0) {
    lines.push(`(... ${omitted} 件のタスクは省略)`);
  }

  lines.push("", "## 依存関係", ...(depLines.length > 0 ? depLines : ["(なし)"]));
  lines.push("", "## マイルストーン", ...(milestoneLines.length > 0 ? milestoneLines : ["(なし)"]));

  return lines.join("\n");
}
