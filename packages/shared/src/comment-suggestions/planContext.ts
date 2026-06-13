import type { ProjectPlan, ScheduledTask, Task } from "../types.js";

/** ローカル LLM のコンテキスト節約用（大きい WBS でも推論時間を抑える） */
export const DEFAULT_PLAN_CONTEXT_TASK_LIMIT = 25;

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

  for (const id of plan.cpm.criticalPath) {
    add(id);
  }

  for (const t of plan.tasks) {
    add(t.id);
    if (selected.size >= limit) break;
  }

  return selected;
}

/** 1行1タスクの短い形式（id|名前|日数|進捗|ES|EF|クリティカル） */
function formatTaskLineCompact(task: Task, scheduled: ScheduledTask | undefined): string {
  const es = scheduled?.earlyStart ?? "-";
  const ef = scheduled?.earlyFinish ?? "-";
  const crit = scheduled?.isCritical ? "C" : "";
  return `${task.id}|${task.name}|${task.durationDays}|${task.progress}|${es}|${ef}|${crit}`;
}

/** ProjectPlan をローカル LLM 向けのテキストに直列化する */
export function serializePlanContext(plan: ProjectPlan, options: PlanContextOptions): string {
  const limit = options.taskLimit ?? DEFAULT_PLAN_CONTEXT_TASK_LIMIT;
  const selectedIds = selectTaskIdsForContext(plan, options.targetTaskId, limit);
  const scheduled = scheduledByTaskId(plan);

  const taskLines = plan.tasks
    .filter((t) => selectedIds.has(t.id))
    .map((t) => formatTaskLineCompact(t, scheduled.get(t.id)));

  const omitted = plan.tasks.length - taskLines.length;

  const depLines = plan.dependencies
    .filter((d) => selectedIds.has(d.predecessorId) && selectedIds.has(d.successorId))
    .map((d) => `${d.predecessorId}->${d.successorId}|${d.type}|lag=${d.lagDays}`);

  const milestoneLines = plan.milestones.map((m) => `${m.id}|${m.name}|${m.dueDate}|${m.status}`);

  const lines = [
    `project=${plan.project.name} start=${plan.project.startDate} duration=${plan.cpm.projectDuration}`,
    `criticalPath=${plan.cpm.criticalPath.join(",") || "(none)"}`,
    "tasks(id|name|days|progress|ES|EF|C):",
    ...taskLines,
  ];

  if (omitted > 0) {
    lines.push(`(...${omitted} tasks omitted)`);
  }

  lines.push(
    "deps(pred->succ|type|lag):",
    ...(depLines.length > 0 ? depLines : ["(none)"]),
    "milestones(id|name|due|status):",
    ...(milestoneLines.length > 0 ? milestoneLines : ["(none)"]),
  );

  return lines.join("\n");
}
