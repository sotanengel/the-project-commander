/**
 * ネットワーク図・依存関係エディタのロジック（純粋関数）。
 * 描画コンポーネントから分離し、Vitestでテスト可能にする。
 */
import type { DependencyType, Task } from "@tpc/shared";
import { buildWbsTree, flattenWbsTree } from "@tpc/shared";

/**
 * エッジに表示するラベル文字列を返す。
 *
 * - FS かつ ラグ0（デフォルトの依存）はラベル不要のため null
 * - ラグ0なら「SS」のようにタイプのみ
 * - ラグありなら「SS+2」「FS-1」形式（負=リード）
 */
export function edgeLabel(type: DependencyType, lagDays: number): string | null {
  if (type === "FS" && lagDays === 0) return null;
  if (lagDays === 0) return type;
  const sign = lagDays > 0 ? "+" : "";
  return `${type}${sign}${lagDays}`;
}

/** 葉タスク（ワークパッケージ）をWBS順（深さ優先・sortOrder順）で返す */
export function leafTasksInWbsOrder(tasks: Task[]): Task[] {
  return flattenWbsTree(buildWbsTree(tasks))
    .filter((node) => node.children.length === 0)
    .map((node) => node.task);
}

/** 依存タイプの選択肢（select用）、凡例の説明、フォーム横に出す選択ガイド */
export const DEPENDENCY_TYPE_OPTIONS: ReadonlyArray<{
  value: DependencyType;
  label: string;
  description: string;
  /** タイプ選択時にフォーム近くへ動的表示する平易なガイド文 */
  guide: string;
}> = [
  {
    value: "FS",
    label: "FS: 完了後に開始",
    description: "先行タスクの完了後に後続タスクを開始",
    guide: "前のタスクが終わったら次を開始（最も一般的。迷ったらこれ）",
  },
  {
    value: "SS",
    label: "SS: 同時に開始",
    description: "先行タスクの開始と同時に後続タスクを開始",
    guide: "2つのタスクを同時に開始（並行で進める作業に）",
  },
  {
    value: "FF",
    label: "FF: 同時に完了",
    description: "先行タスクの完了と同時に後続タスクを完了",
    guide: "2つのタスクを同時に終了（仕上がりをそろえたいときに）",
  },
  {
    value: "SF",
    label: "SF: 開始後に完了",
    description: "先行タスクの開始後に後続タスクを完了",
    guide: "後続の終了が先行の開始を待つ（使う場面は稀）",
  },
];

/** 重複・循環判定に必要な依存関係の最小フィールド */
export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * 既存依存に同じ（先行,後続）ペアがあればその依存を返す。なければ null。
 * 逆向き（後続→先行）のペアは重複とみなさない（それは循環判定の対象）。
 */
export function findDuplicateDependency<T extends DependencyEdge>(
  dependencies: readonly T[],
  predecessorId: string,
  successorId: string,
): T | null {
  return (
    dependencies.find((d) => d.predecessorId === predecessorId && d.successorId === successorId) ??
    null
  );
}

/**
 * 新しい依存（predecessorId → successorId）を追加すると循環になる場合、
 * 既存依存をたどって後続タスクから先行タスクへ到達する経路（タスクIDの並び）を返す。
 * 循環しなければ null。
 *
 * 例: 既存に B→C, C→A があるとき A→B を追加すると ["B", "C", "A"] を返す
 * （B → C → A という既存の流れに、新規の A → B がつながってループになる）。
 */
export function findCyclePath(
  dependencies: readonly DependencyEdge[],
  predecessorId: string,
  successorId: string,
): string[] | null {
  if (predecessorId === successorId) return [predecessorId];
  // successorId から既存エッジをたどって predecessorId に到達できるかをBFSで調べる
  const next = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = next.get(d.predecessorId);
    if (list) list.push(d.successorId);
    else next.set(d.predecessorId, [d.successorId]);
  }
  const parent = new Map<string, string>();
  const visited = new Set<string>([successorId]);
  const queue = [successorId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const n of next.get(current) ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, current);
      if (n === predecessorId) {
        // 経路を successorId → … → predecessorId の順に復元する
        const path: string[] = [];
        let node: string | undefined = n;
        while (node !== undefined) {
          path.unshift(node);
          node = parent.get(node);
        }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** 重複依存をブロックする際の日本語メッセージ（タスク名入り） */
export function duplicateDependencyMessage(predecessorName: string, successorName: string): string {
  return `この組み合わせの依存関係（${predecessorName} → ${successorName}）は既に登録されています。タイプやラグを変えたい場合は、一覧から削除して追加し直してください。`;
}

/**
 * 循環依存をブロックする際の日本語メッセージ（タスク名と解決ヒント入り）。
 * @param cyclePathNames 既存依存の経路（タスク名の並び。後続 → … → 先行）。省略可
 */
export function cycleDependencyMessage(
  predecessorName: string,
  successorName: string,
  cyclePathNames?: readonly string[],
): string {
  const pathNote =
    cyclePathNames && cyclePathNames.length >= 2
      ? `既存の依存（${cyclePathNames.join(" → ")}）と`
      : "既存の依存と";
  return `追加しようとした依存（${predecessorName} → ${successorName}）が${pathNote}ループを作っています。逆向きの依存を削除するか、この依存を見直してください。`;
}
