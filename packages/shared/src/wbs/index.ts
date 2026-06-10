import type { Task } from "../types.js";

export interface WbsNode {
  task: Task;
  children: WbsNode[];
  /** ロールアップ値（葉=自身の値、サマリ=子の集約） */
  rollup: {
    durationDays: number;
    /** 所要日数で重み付けした進捗率 */
    progress: number;
    /** 配下のワークパッケージ数 */
    workPackageCount: number;
  };
}

/**
 * フラットなタスク一覧からWBSツリーを構築する。
 *
 * 暫定版（基盤スタブ）: 並べ替え・100%ルール検証等の完全実装はユニット2で
 * 置き換える。親IDが不明なタスクはルート扱いにする。
 */
export function buildWbsTree(tasks: Task[]): WbsNode[] {
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const parent = t.parentId !== null && ids.has(t.parentId) ? t.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), t]);
  }

  function build(task: Task): WbsNode {
    const children = (childrenOf.get(task.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(build);
    return { task, children, rollup: rollup(task, children) };
  }

  return (childrenOf.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map(build);
}

function rollup(task: Task, children: WbsNode[]): WbsNode["rollup"] {
  if (children.length === 0) {
    return { durationDays: task.durationDays, progress: task.progress, workPackageCount: 1 };
  }
  const durationDays = children.reduce((sum, c) => sum + c.rollup.durationDays, 0);
  const weighted = children.reduce((sum, c) => sum + c.rollup.progress * c.rollup.durationDays, 0);
  return {
    durationDays,
    progress: durationDays > 0 ? weighted / durationDays : 0,
    workPackageCount: children.reduce((sum, c) => sum + c.rollup.workPackageCount, 0),
  };
}

/** ツリーを深さ付きでフラット化（テーブル表示用） */
export function flattenWbsTree(nodes: WbsNode[], depth = 0): Array<WbsNode & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenWbsTree(n.children, depth + 1)]);
}

// ---- WBS検証 ----

export type WbsIssueType = "duplicateId" | "missingParent" | "cycle";

export interface WbsValidationIssue {
  type: WbsIssueType;
  /** 問題のあるタスクID */
  taskId: string;
  /** 日本語の説明メッセージ */
  message: string;
}

export interface WbsValidationResult {
  valid: boolean;
  issues: WbsValidationIssue[];
}

/**
 * WBS構造の整合性を検証する。
 *
 * - ID重複
 * - 存在しない parentId への参照
 * - 親子関係の循環（タスクが自分の祖先になっている）
 */
export function validateWbs(tasks: Task[]): WbsValidationResult {
  const issues: WbsValidationIssue[] = [];

  // ID重複
  const counts = new Map<string, number>();
  for (const t of tasks) {
    counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 1) {
      issues.push({
        type: "duplicateId",
        taskId: id,
        message: `タスクID「${id}」が重複しています`,
      });
    }
  }

  // 存在しない親
  const ids = new Set(counts.keys());
  for (const t of tasks) {
    if (t.parentId !== null && !ids.has(t.parentId)) {
      issues.push({
        type: "missingParent",
        taskId: t.id,
        message: `タスク「${t.id}」の親タスク「${t.parentId}」が存在しません`,
      });
    }
  }

  // 循環検出（親チェーンを辿り、自分に戻ったら循環）
  const parentOf = new Map<string, string | null>();
  for (const t of tasks) {
    if (!parentOf.has(t.id)) parentOf.set(t.id, t.parentId);
  }
  const reported = new Set<string>();
  for (const t of tasks) {
    if (reported.has(t.id)) continue;
    const visited = new Set<string>([t.id]);
    let current = parentOf.get(t.id) ?? null;
    while (current !== null && parentOf.has(current)) {
      if (visited.has(current)) {
        // tから辿れる循環。t自身が循環内にいる場合のみ報告する
        const cycle = collectCycle(current, parentOf);
        if (cycle.has(t.id) && !reported.has(t.id)) {
          reported.add(t.id);
          issues.push({
            type: "cycle",
            taskId: t.id,
            message: `タスク「${t.id}」の親子関係が循環しています`,
          });
        }
        break;
      }
      visited.add(current);
      current = parentOf.get(current) ?? null;
    }
  }

  return { valid: issues.length === 0, issues };
}

/** 循環内のタスクID集合を返す（startは循環上のいずれかのタスク） */
function collectCycle(start: string, parentOf: Map<string, string | null>): Set<string> {
  const cycle = new Set<string>([start]);
  let current = parentOf.get(start) ?? null;
  while (current !== null && current !== start && !cycle.has(current)) {
    cycle.add(current);
    current = parentOf.get(current) ?? null;
  }
  return cycle;
}

// ---- 移動系ヘルパー（全て純粋関数。部分更新リストを返す） ----

/** api.updateTask へ渡せるタスクの部分更新 */
export interface WbsTaskUpdate {
  taskId: string;
  changes: {
    parentId?: string | null;
    sortOrder?: number;
  };
}

export type WbsMoveResult = { ok: true; updates: WbsTaskUpdate[] } | { ok: false; reason: string };

/** 同一親のタスクをsortOrder順（同値は元配列順）で返す */
function siblingsOf(tasks: Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 「親グループごとの並び順」の希望状態から、現状との差分のみを更新リストにする。
 * sortOrderは各グループ内で 0,1,2,... に正規化される。
 */
function diffArrangement(
  tasks: Task[],
  groups: Array<{ parentId: string | null; orderedIds: string[] }>,
): WbsTaskUpdate[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const updates: WbsTaskUpdate[] = [];
  for (const group of groups) {
    group.orderedIds.forEach((id, index) => {
      const current = byId.get(id);
      if (!current) return;
      const changes: WbsTaskUpdate["changes"] = {};
      if (current.parentId !== group.parentId) changes.parentId = group.parentId;
      if (current.sortOrder !== index) changes.sortOrder = index;
      if (Object.keys(changes).length > 0) updates.push({ taskId: id, changes });
    });
  }
  return updates;
}

function notFound(taskId: string): WbsMoveResult {
  return { ok: false, reason: `タスク「${taskId}」が見つかりません` };
}

/** 同一親内で1つ上へ移動する */
export function moveTaskUp(tasks: Task[], taskId: string): WbsMoveResult {
  return swapWithNeighbor(tasks, taskId, -1);
}

/** 同一親内で1つ下へ移動する */
export function moveTaskDown(tasks: Task[], taskId: string): WbsMoveResult {
  return swapWithNeighbor(tasks, taskId, +1);
}

function swapWithNeighbor(tasks: Task[], taskId: string, offset: -1 | 1): WbsMoveResult {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return notFound(taskId);

  const siblings = siblingsOf(tasks, target.parentId);
  const index = siblings.findIndex((t) => t.id === taskId);
  const swapIndex = index + offset;
  if (swapIndex < 0) {
    return { ok: false, reason: "すでに先頭のため上へ移動できません" };
  }
  if (swapIndex >= siblings.length) {
    return { ok: false, reason: "すでに末尾のため下へ移動できません" };
  }

  const orderedIds = siblings.map((t) => t.id);
  const tmp = orderedIds[index] as string;
  orderedIds[index] = orderedIds[swapIndex] as string;
  orderedIds[swapIndex] = tmp;

  return {
    ok: true,
    updates: diffArrangement(tasks, [{ parentId: target.parentId, orderedIds }]),
  };
}

/** 直前の兄弟タスクの子（末尾）にする */
export function indentTask(tasks: Task[], taskId: string): WbsMoveResult {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return notFound(taskId);

  const siblings = siblingsOf(tasks, target.parentId);
  const index = siblings.findIndex((t) => t.id === taskId);
  if (index <= 0) {
    return { ok: false, reason: "直前の兄弟タスクがないためインデントできません" };
  }
  const newParent = siblings[index - 1] as Task;

  const oldGroupIds = siblings.filter((t) => t.id !== taskId).map((t) => t.id);
  const newGroupIds = [...siblingsOf(tasks, newParent.id).map((t) => t.id), taskId];

  return {
    ok: true,
    updates: diffArrangement(tasks, [
      { parentId: target.parentId, orderedIds: oldGroupIds },
      { parentId: newParent.id, orderedIds: newGroupIds },
    ]),
  };
}

/** 親の兄弟（親の直後）に昇格する */
export function outdentTask(tasks: Task[], taskId: string): WbsMoveResult {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return notFound(taskId);
  if (target.parentId === null) {
    return { ok: false, reason: "ルート直下のタスクのためアウトデントできません" };
  }
  const parent = tasks.find((t) => t.id === target.parentId);
  if (!parent) {
    return { ok: false, reason: `親タスク「${target.parentId}」が見つかりません` };
  }

  const oldGroupIds = siblingsOf(tasks, target.parentId)
    .filter((t) => t.id !== taskId)
    .map((t) => t.id);

  const parentSiblingIds = siblingsOf(tasks, parent.parentId).map((t) => t.id);
  const insertAt = parentSiblingIds.indexOf(parent.id) + 1;
  const newGroupIds = [
    ...parentSiblingIds.slice(0, insertAt),
    taskId,
    ...parentSiblingIds.slice(insertAt),
  ];

  return {
    ok: true,
    updates: diffArrangement(tasks, [
      { parentId: target.parentId, orderedIds: oldGroupIds },
      { parentId: parent.parentId, orderedIds: newGroupIds },
    ]),
  };
}

/** 任意の親の末尾へ移動する（自分自身・自分の子孫の配下への移動は拒否） */
export function reparentTask(
  tasks: Task[],
  taskId: string,
  newParentId: string | null,
): WbsMoveResult {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return notFound(taskId);

  if (newParentId !== null) {
    if (newParentId === taskId) {
      return { ok: false, reason: "タスクを自分自身の配下へは移動できません" };
    }
    if (!tasks.some((t) => t.id === newParentId)) {
      return { ok: false, reason: `移動先の親タスク「${newParentId}」が見つかりません` };
    }
    if (isDescendant(tasks, taskId, newParentId)) {
      return { ok: false, reason: "タスクを自分の子孫の配下へは移動できません" };
    }
  }

  const oldGroupIds = siblingsOf(tasks, target.parentId)
    .filter((t) => t.id !== taskId)
    .map((t) => t.id);
  const newGroupIds = [
    ...siblingsOf(tasks, newParentId)
      .filter((t) => t.id !== taskId)
      .map((t) => t.id),
    taskId,
  ];

  const groups =
    newParentId === target.parentId
      ? [{ parentId: newParentId, orderedIds: newGroupIds }]
      : [
          { parentId: target.parentId, orderedIds: oldGroupIds },
          { parentId: newParentId, orderedIds: newGroupIds },
        ];

  return { ok: true, updates: diffArrangement(tasks, groups) };
}

/** candidateId が ancestorId の子孫かどうか（親チェーンを辿って判定。循環時も停止する） */
function isDescendant(tasks: Task[], ancestorId: string, candidateId: string): boolean {
  const parentOf = new Map(tasks.map((t) => [t.id, t.parentId]));
  const visited = new Set<string>();
  let current = parentOf.get(candidateId) ?? null;
  while (current !== null && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/**
 * 全グループのsortOrderを 0,1,2,... に正規化する更新リストを返す。
 * 既に正規化済みのタスクは含まれない。
 */
export function normalizeSortOrders(tasks: Task[]): WbsTaskUpdate[] {
  const parents = new Map<string | null, true>();
  for (const t of tasks) {
    if (!parents.has(t.parentId)) parents.set(t.parentId, true);
  }
  const groups = [...parents.keys()].map((parentId) => ({
    parentId,
    orderedIds: siblingsOf(tasks, parentId).map((t) => t.id),
  }));
  return diffArrangement(tasks, groups);
}
