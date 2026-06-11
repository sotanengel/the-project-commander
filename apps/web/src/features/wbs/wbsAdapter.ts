import type { Task, TaskUpdateInput } from "@tpc/shared";
import type { WbsMoveResult, WbsSiblingInsertPlan, WbsTaskUpdate } from "@tpc/shared";
import { indentTask, moveTaskDown, moveTaskUp, outdentTask } from "@tpc/shared";

export interface TaskUpdatePlan {
  id: string;
  input: TaskUpdateInput;
}

export interface SiblingInsertPlan {
  parentId: string | null;
  sortOrder: number;
  bumps: TaskUpdatePlan[];
}

function wbsUpdatesToPlans(updates: WbsTaskUpdate[]): TaskUpdatePlan[] {
  return updates.map((u) => ({ id: u.taskId, input: u.changes }));
}

export function plansFromMoveResult(result: WbsMoveResult): TaskUpdatePlan[] | null {
  if (!result.ok) return null;
  return wbsUpdatesToPlans(result.updates);
}

export function moveTaskPlans(
  tasks: Task[],
  taskId: string,
  direction: "up" | "down",
): TaskUpdatePlan[] | null {
  const result = direction === "up" ? moveTaskUp(tasks, taskId) : moveTaskDown(tasks, taskId);
  return plansFromMoveResult(result);
}

export function indentTaskPlans(tasks: Task[], taskId: string): TaskUpdatePlan[] | null {
  return plansFromMoveResult(indentTask(tasks, taskId));
}

export function outdentTaskPlans(tasks: Task[], taskId: string): TaskUpdatePlan[] | null {
  return plansFromMoveResult(outdentTask(tasks, taskId));
}

export function adaptSiblingInsertPlan(
  plan: WbsSiblingInsertPlan | null,
): SiblingInsertPlan | null {
  if (!plan) return null;
  return {
    parentId: plan.parentId,
    sortOrder: plan.sortOrder,
    bumps: wbsUpdatesToPlans(plan.bumps),
  };
}
