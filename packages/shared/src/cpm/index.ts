import type { CpmResult, Dependency, ScheduledTask, Task } from "../types.js";

export class CycleError extends Error {
  constructor(taskIds: string[]) {
    super(`依存関係に循環があります: ${taskIds.join(" -> ")}`);
    this.name = "CycleError";
  }
}

const EPSILON = 1e-9;

/**
 * クリティカルパス法（CPM）によるスケジュール計算。
 *
 * 暫定版（基盤スタブ）: FS依存 + ラグのみ対応。SS/FF/SF・フリーフロートの
 * 完全実装はユニット1で置き換える。
 *
 * - 対象はワークパッケージ（子を持たない葉タスク）のみ。サマリタスクと
 *   サマリタスクへの依存は無視される。
 * - 日数は数値（プロジェクト開始からの経過日数、0始まり）。
 */
export function computeCpm(tasks: Task[], dependencies: Dependency[]): CpmResult {
  const parentIds = new Set(tasks.map((t) => t.parentId).filter((p): p is string => p !== null));
  const leaves = tasks.filter((t) => !parentIds.has(t.id));
  const leafIds = new Set(leaves.map((t) => t.id));
  const byId = new Map(leaves.map((t) => [t.id, t]));

  const deps = dependencies.filter(
    (d) => leafIds.has(d.predecessorId) && leafIds.has(d.successorId),
  );
  const predsOf = new Map<string, Dependency[]>();
  const succsOf = new Map<string, Dependency[]>();
  for (const d of deps) {
    predsOf.set(d.successorId, [...(predsOf.get(d.successorId) ?? []), d]);
    succsOf.set(d.predecessorId, [...(succsOf.get(d.predecessorId) ?? []), d]);
  }

  const order = topologicalSort(leaves, deps);

  // フォワードパス
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const task = byId.get(id);
    if (!task) continue;
    let start = 0;
    for (const d of predsOf.get(id) ?? []) {
      const predFinish = ef.get(d.predecessorId) ?? 0;
      start = Math.max(start, predFinish + d.lagDays);
    }
    es.set(id, start);
    ef.set(id, start + task.durationDays);
  }

  const projectDuration = Math.max(0, ...order.map((id) => ef.get(id) ?? 0));

  // バックワードパス
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const task = byId.get(id);
    if (!task) continue;
    let finish = projectDuration;
    for (const d of succsOf.get(id) ?? []) {
      const succStart = ls.get(d.successorId) ?? projectDuration;
      finish = Math.min(finish, succStart - d.lagDays);
    }
    lf.set(id, finish);
    ls.set(id, finish - task.durationDays);
  }

  const scheduled: ScheduledTask[] = order.map((id) => {
    const earlyStart = es.get(id) ?? 0;
    const earlyFinish = ef.get(id) ?? 0;
    const lateStart = ls.get(id) ?? 0;
    const lateFinish = lf.get(id) ?? 0;
    const totalFloat = lateStart - earlyStart;
    // フリーフロート: 後続のESを遅らせない範囲（FSのみの暫定計算）
    const succs = succsOf.get(id) ?? [];
    const freeFloat =
      succs.length === 0
        ? projectDuration - earlyFinish
        : Math.min(...succs.map((d) => (es.get(d.successorId) ?? 0) - d.lagDays - earlyFinish));
    return {
      taskId: id,
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      totalFloat,
      freeFloat,
      isCritical: Math.abs(totalFloat) < EPSILON,
    };
  });

  const criticalPath = scheduled
    .filter((t) => t.isCritical)
    .sort((a, b) => a.earlyStart - b.earlyStart)
    .map((t) => t.taskId);

  return { tasks: scheduled, projectDuration, criticalPath };
}

/** Kahnのアルゴリズムによるトポロジカルソート。循環があれば CycleError を投げる */
export function topologicalSort(tasks: Task[], dependencies: Dependency[]): string[] {
  const inDegree = new Map<string, number>(tasks.map((t) => [t.id, 0]));
  const succsOf = new Map<string, string[]>();
  for (const d of dependencies) {
    inDegree.set(d.successorId, (inDegree.get(d.successorId) ?? 0) + 1);
    succsOf.set(d.predecessorId, [...(succsOf.get(d.predecessorId) ?? []), d.successorId]);
  }
  const queue = tasks.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    order.push(id);
    for (const succ of succsOf.get(id) ?? []) {
      const deg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, deg);
      if (deg === 0) queue.push(succ);
    }
  }
  if (order.length !== tasks.length) {
    const remaining = tasks.map((t) => t.id).filter((id) => !order.includes(id));
    throw new CycleError(remaining);
  }
  return order;
}
