import type { Task, TaskUpdateInput } from "@tpc/shared";

export interface TaskUpdatePlan {
  id: string;
  input: TaskUpdateInput;
}

export interface SiblingInsertPlan {
  parentId: string | null;
  sortOrder: number;
  bumps: TaskUpdatePlan[];
}

function siblingsOf(tasks: Task[], task: Task): Task[] {
  return tasks
    .filter((t) => t.parentId === task.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || tasks.indexOf(a) - tasks.indexOf(b));
}

function siblingIndex(siblings: Task[], taskId: string): number {
  return siblings.findIndex((t) => t.id === taskId);
}

/** 同一親内で上/下に移動する更新計画。不可なら null */
export function moveTask(
  tasks: Task[],
  taskId: string,
  direction: "up" | "down",
): TaskUpdatePlan[] | null {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const siblings = siblingsOf(tasks, task);
  const idx = siblingIndex(siblings, taskId);
  if (idx < 0) return null;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return null;

  const reordered = [...siblings];
  const a = reordered[idx];
  const b = reordered[swapIdx];
  if (!a || !b) return null;
  reordered[idx] = b;
  reordered[swapIdx] = a;

  const updates: TaskUpdatePlan[] = [];
  const pushIfChanged = (id: string, newOrder: number) => {
    const orig = tasks.find((t) => t.id === id);
    const origIdx = siblings.findIndex((s) => s.id === id);
    if (!orig) return;
    if (orig.sortOrder !== newOrder || origIdx !== newOrder) {
      updates.push({ id, input: { sortOrder: newOrder } });
    }
  };
  if (direction === "up") {
    pushIfChanged(b.id, idx);
    pushIfChanged(a.id, swapIdx);
  } else {
    pushIfChanged(a.id, swapIdx);
    pushIfChanged(b.id, idx);
  }
  for (let i = 0; i < reordered.length; i++) {
    const s = reordered[i];
    if (!s || s.id === a.id || s.id === b.id) continue;
    pushIfChanged(s.id, i);
  }
  return updates;
}

/** インデント: 直前の兄弟の子になる */
export function indentTask(tasks: Task[], taskId: string): TaskUpdatePlan[] | null {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const siblings = siblingsOf(tasks, task);
  const idx = siblingIndex(siblings, taskId);
  if (idx <= 0) return null;
  const prev = siblings[idx - 1];
  if (!prev) return null;
  const children = tasks.filter((t) => t.parentId === prev.id);
  const maxOrder = children.reduce((m, c) => Math.max(m, c.sortOrder), -1);
  return [{ id: taskId, input: { parentId: prev.id, sortOrder: maxOrder + 1 } }];
}

/** アウトデント: 親の階層で親の直後に挿入 */
export function outdentTask(tasks: Task[], taskId: string): TaskUpdatePlan[] | null {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.parentId === null) return null;
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return null;
  const parentSiblings = siblingsOf(tasks, parent);
  const parentIdx = siblingIndex(parentSiblings, parent.id);
  const newOrder = parent.sortOrder + 1;
  const updates: TaskUpdatePlan[] = [
    { id: taskId, input: { parentId: null, sortOrder: newOrder } },
  ];
  for (const sib of parentSiblings) {
    if (sib.sortOrder >= newOrder && sib.id !== taskId) {
      updates.push({ id: sib.id, input: { sortOrder: sib.sortOrder + 1 } });
    }
  }
  return updates;
}

/** 兄弟タスクを対象の直下に挿入する計画 */
export function insertSiblingPlan(tasks: Task[], afterTaskId: string): SiblingInsertPlan | null {
  const task = tasks.find((t) => t.id === afterTaskId);
  if (!task) return null;
  const siblings = siblingsOf(tasks, task);
  const idx = siblingIndex(siblings, afterTaskId);
  if (idx < 0) return null;
  const sortOrder = task.sortOrder + 1;
  const bumps: TaskUpdatePlan[] = [];
  for (const sib of siblings) {
    if (sib.sortOrder >= sortOrder && sib.id !== afterTaskId) {
      bumps.push({ id: sib.id, input: { sortOrder: sib.sortOrder + 1 } });
    }
  }
  return { parentId: task.parentId, sortOrder, bumps };
}

/** 子孫タスク数（直接の子のみでなく全子孫） */
export function countDescendants(tasks: Task[], taskId: string): number {
  const children = tasks.filter((t) => t.parentId === taskId);
  return children.reduce((sum, c) => sum + 1 + countDescendants(tasks, c.id), 0);
}
