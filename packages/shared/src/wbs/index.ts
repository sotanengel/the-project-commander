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
