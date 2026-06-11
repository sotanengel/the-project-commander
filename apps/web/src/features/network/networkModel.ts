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

/** 依存タイプの選択肢（select用）と凡例の説明 */
export const DEPENDENCY_TYPE_OPTIONS: ReadonlyArray<{
  value: DependencyType;
  label: string;
  description: string;
}> = [
  {
    value: "FS",
    label: "FS: 完了後に開始",
    description: "先行タスクの完了後に後続タスクを開始",
  },
  {
    value: "SS",
    label: "SS: 同時に開始",
    description: "先行タスクの開始と同時に後続タスクを開始",
  },
  {
    value: "FF",
    label: "FF: 同時に完了",
    description: "先行タスクの完了と同時に後続タスクを完了",
  },
  {
    value: "SF",
    label: "SF: 開始後に完了",
    description: "先行タスクの開始後に後続タスクを完了",
  },
];
