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
 * PMBOK第8版準拠のPDM（プレシデンス・ダイアグラム法）完全実装。
 * 依存タイプ4種（FS/SS/FF/SF）とラグ（負の値=リードも可）に対応する。
 *
 * フォワードパスの制約:
 * - FS: ES_succ ≥ EF_pred + lag
 * - SS: ES_succ ≥ ES_pred + lag
 * - FF: EF_succ ≥ EF_pred + lag
 * - SF: EF_succ ≥ ES_pred + lag
 *
 * ES = max(0, ES制約)、EF = max(ES + duration, EF制約)。
 * FF/SF制約が支配する場合は EF > ES + duration となりうるが、ESは引きずらない
 * （タスクのESは早く開始できる最早日を保持する）。
 *
 * バックワードパスは対称に:
 * - FS: LF_pred ≤ LS_succ - lag
 * - SS: LS_pred ≤ LS_succ - lag
 * - FF: LF_pred ≤ LF_succ - lag
 * - SF: LS_pred ≤ LF_succ - lag
 *
 * LF = min(projectDuration, LF制約)、LS = min(LF - duration, LS制約)。
 *
 * - トータルフロート = LS - ES。フロートが（誤差 1e-9 内で）0 のタスクが
 *   クリティカル。
 * - フリーフロートは依存タイプごとに「後続の最早日程を遅らせない余裕」を計算し、
 *   後続を持たないタスクは projectDuration - EF。
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

  // フォワードパス: ES/EF を算出
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const task = byId.get(id);
    if (!task) continue;
    let earliestStart = 0;
    let finishConstraint = Number.NEGATIVE_INFINITY;
    for (const d of predsOf.get(id) ?? []) {
      const predStart = es.get(d.predecessorId) ?? 0;
      const predFinish = ef.get(d.predecessorId) ?? 0;
      switch (d.type) {
        case "FS":
          earliestStart = Math.max(earliestStart, predFinish + d.lagDays);
          break;
        case "SS":
          earliestStart = Math.max(earliestStart, predStart + d.lagDays);
          break;
        case "FF":
          finishConstraint = Math.max(finishConstraint, predFinish + d.lagDays);
          break;
        case "SF":
          finishConstraint = Math.max(finishConstraint, predStart + d.lagDays);
          break;
      }
    }
    es.set(id, earliestStart);
    ef.set(id, Math.max(earliestStart + task.durationDays, finishConstraint));
  }

  const projectDuration = Math.max(0, ...order.map((id) => ef.get(id) ?? 0));

  // バックワードパス: LS/LF を算出（フォワードと対称）
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const task = byId.get(id);
    if (!task) continue;
    let latestFinish = projectDuration;
    let startConstraint = Number.POSITIVE_INFINITY;
    for (const d of succsOf.get(id) ?? []) {
      const succLateStart = ls.get(d.successorId) ?? projectDuration;
      const succLateFinish = lf.get(d.successorId) ?? projectDuration;
      switch (d.type) {
        case "FS":
          latestFinish = Math.min(latestFinish, succLateStart - d.lagDays);
          break;
        case "FF":
          latestFinish = Math.min(latestFinish, succLateFinish - d.lagDays);
          break;
        case "SS":
          startConstraint = Math.min(startConstraint, succLateStart - d.lagDays);
          break;
        case "SF":
          startConstraint = Math.min(startConstraint, succLateFinish - d.lagDays);
          break;
      }
    }
    lf.set(id, latestFinish);
    ls.set(id, Math.min(latestFinish - task.durationDays, startConstraint));
  }

  const scheduled: ScheduledTask[] = order.map((id) => {
    const earlyStart = es.get(id) ?? 0;
    const earlyFinish = ef.get(id) ?? 0;
    const lateStart = ls.get(id) ?? 0;
    const lateFinish = lf.get(id) ?? 0;
    const totalFloat = lateStart - earlyStart;
    // フリーフロート: 後続タスクの最早日程を遅らせずに本タスクを遅らせられる余裕。
    // 依存タイプごとにフォワードパスの制約式と対称な余裕を取る。
    const succs = succsOf.get(id) ?? [];
    const freeFloat =
      succs.length === 0
        ? projectDuration - earlyFinish
        : Math.min(
            ...succs.map((d) => {
              const succStart = es.get(d.successorId) ?? 0;
              const succFinish = ef.get(d.successorId) ?? 0;
              switch (d.type) {
                case "FS":
                  return succStart - d.lagDays - earlyFinish;
                case "SS":
                  return succStart - d.lagDays - earlyStart;
                case "FF":
                  return succFinish - d.lagDays - earlyFinish;
                case "SF":
                  return succFinish - d.lagDays - earlyStart;
              }
            }),
          );
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
