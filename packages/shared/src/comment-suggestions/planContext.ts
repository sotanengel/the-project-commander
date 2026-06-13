import type { ProjectPlan, ScheduledTask, Task } from "../types.js";

/** ローカル LLM のコンテキスト節約用（大きい WBS でも推論時間を抑える） */
export const DEFAULT_PLAN_CONTEXT_TASK_LIMIT = 25;
/** Ollama num_ctx=4096 向けの計画コンテキスト目標トークン数 */
export const PLAN_CONTEXT_TOKEN_BUDGET = 2800;
export const FOCUS_DESCRIPTION_MAX_CHARS = 200;

export interface PlanContextOptions {
  targetTaskId: string;
  commentBody?: string;
  taskLimit?: number;
}

function scheduledByTaskId(plan: ProjectPlan): Map<string, ScheduledTask> {
  const map = new Map<string, ScheduledTask>();
  for (const s of plan.cpm.tasks) {
    map.set(s.taskId, s);
  }
  return map;
}

/** コメント本文に含まれる計画内タスク名を検出（長い名前を優先） */
export function matchTaskNamesInComment(plan: ProjectPlan, commentBody: string): string[] {
  const comment = commentBody.trim();
  if (!comment) return [];

  const matched: string[] = [];
  const tasks = [...plan.tasks].sort((a, b) => b.name.length - a.name.length);
  for (const task of tasks) {
    const name = task.name.trim();
    if (name && comment.includes(name)) {
      matched.push(task.id);
    }
  }
  return matched;
}

/** 対象タスク周辺（親子・依存・コメント言及）をフォーカス ID にする */
export function selectFocusTaskIds(
  plan: ProjectPlan,
  targetTaskId: string,
  commentBody?: string,
): Set<string> {
  const focus = new Set<string>();
  if (!plan.tasks.some((t) => t.id === targetTaskId)) {
    return focus;
  }

  const add = (id: string) => focus.add(id);
  add(targetTaskId);

  for (const id of matchTaskNamesInComment(plan, commentBody ?? "")) {
    add(id);
  }

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

  return focus;
}

/** 対象タスク周辺（親子・依存・コメント言及）を優先してタスク ID を選ぶ */
export function selectTaskIdsForContext(
  plan: ProjectPlan,
  targetTaskId: string,
  limit: number,
  commentBody?: string,
): Set<string> {
  const selected = new Set<string>();
  if (!plan.tasks.some((t) => t.id === targetTaskId)) {
    return selected;
  }

  const add = (id: string) => {
    if (selected.size < limit) selected.add(id);
  };

  for (const id of selectFocusTaskIds(plan, targetTaskId, commentBody)) {
    add(id);
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

/** テキストのトークン数を概算（日本語混在向けに chars/3） */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function truncateDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= FOCUS_DESCRIPTION_MAX_CHARS) return normalized;
  return `${normalized.slice(0, FOCUS_DESCRIPTION_MAX_CHARS)}…`;
}

/** FOCUS 用: id|name|desc|days|progress|assignee */
function formatTaskFocusLine(task: Task): string {
  const desc = truncateDescription(task.description ?? "");
  const assignee = task.assignee?.trim() || "-";
  return `${task.id}|${task.name}|${desc}|${task.durationDays}|${task.progress}|${assignee}`;
}

/** SCHEDULE 用: id|name|days|progress|ES|EF|C */
function formatTaskScheduleLine(task: Task, scheduled: ScheduledTask | undefined): string {
  const es = scheduled?.earlyStart ?? "-";
  const ef = scheduled?.earlyFinish ?? "-";
  const crit = scheduled?.isCritical ? "C" : "";
  return `${task.id}|${task.name}|${task.durationDays}|${task.progress}|${es}|${ef}|${crit}`;
}

/** ProjectPlan をローカル LLM 向けのテキストに直列化する */
export function serializePlanContext(plan: ProjectPlan, options: PlanContextOptions): string {
  const limit = options.taskLimit ?? DEFAULT_PLAN_CONTEXT_TASK_LIMIT;
  const selectedIds = selectTaskIdsForContext(
    plan,
    options.targetTaskId,
    limit,
    options.commentBody,
  );
  const focusIds = selectFocusTaskIds(plan, options.targetTaskId, options.commentBody);
  const scheduled = scheduledByTaskId(plan);

  const focusLines = plan.tasks
    .filter((t) => focusIds.has(t.id) && selectedIds.has(t.id))
    .map((t) => formatTaskFocusLine(t));

  const indexLines = plan.tasks
    .filter((t) => selectedIds.has(t.id))
    .map((t) => `${t.id}|${t.name}`);

  const scheduleLines = plan.tasks
    .filter((t) => selectedIds.has(t.id))
    .map((t) => formatTaskScheduleLine(t, scheduled.get(t.id)));

  const omitted = plan.tasks.length - selectedIds.size;

  const depLines = plan.dependencies
    .filter((d) => selectedIds.has(d.predecessorId) && selectedIds.has(d.successorId))
    .map((d) => `${d.predecessorId}->${d.successorId}|${d.type}|lag=${d.lagDays}`);

  const milestoneLines = plan.milestones.map((m) => `${m.id}|${m.name}|${m.dueDate}|${m.status}`);

  const lines = [
    `project=${plan.project.name} start=${plan.project.startDate} duration=${plan.cpm.projectDuration}`,
    `criticalPath=${plan.cpm.criticalPath.join(",") || "(none)"}`,
    "FOCUS(id|name|desc|days|progress|assignee):",
    ...(focusLines.length > 0 ? focusLines : ["(none)"]),
    "INDEX(id|name):",
    ...(indexLines.length > 0 ? indexLines : ["(none)"]),
    "SCHEDULE(id|name|days|progress|ES|EF|C):",
    ...scheduleLines,
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

/** トークン予算内に収まるよう taskLimit を下げながら計画コンテキストを生成 */
export function serializePlanContextWithinBudget(
  plan: ProjectPlan,
  options: PlanContextOptions,
  tokenBudget = PLAN_CONTEXT_TOKEN_BUDGET,
): string {
  let limit = options.taskLimit ?? DEFAULT_PLAN_CONTEXT_TASK_LIMIT;
  let text = serializePlanContext(plan, { ...options, taskLimit: limit });

  while (estimateTextTokens(text) > tokenBudget && limit > 3) {
    limit = Math.max(3, Math.floor(limit * 0.7));
    text = serializePlanContext(plan, { ...options, taskLimit: limit });
  }

  return text;
}
