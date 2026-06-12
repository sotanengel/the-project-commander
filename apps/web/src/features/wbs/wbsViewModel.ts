/**
 * WBSページの表示・編集ロジック（純関数）。
 * コンポーネント（WbsPage.tsx）から切り出してユニットテスト可能にする。
 */

export interface TaskEditDraft {
  /** タスク名の入力値（トリム前） */
  name: string;
  /** 所要日数の入力値（文字列のまま受け取る） */
  duration: string;
  /** 進捗の入力値。ワークパッケージ編集時のみ渡す */
  progress?: string;
}

export interface TaskEditErrors {
  name?: string;
  duration?: string;
}

export type TaskEditResult =
  | {
      ok: true;
      value: { name: string; durationDays: number; progress?: number };
    }
  | { ok: false; errors: TaskEditErrors };

/** 進捗率を 0〜100 に丸める。数値でない場合は 0 とする */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * インライン編集の入力値を検証する。
 * - タスク名: 空・空白のみは不可
 * - 所要日数: 0以上の数値のみ（小数可）
 * - 進捗: 0〜100 にクランプ（エラーにはしない）
 */
export function validateTaskEdit(draft: TaskEditDraft): TaskEditResult {
  const errors: TaskEditErrors = {};

  const name = draft.name.trim();
  if (name.length === 0) {
    errors.name = "タスク名を入力してください";
  }

  const durationDays = draft.duration.trim() === "" ? Number.NaN : Number(draft.duration);
  if (Number.isNaN(durationDays) || durationDays < 0) {
    errors.duration = "所要日数は0以上の数値で入力してください";
  }

  if (errors.name || errors.duration) {
    return { ok: false, errors };
  }

  if (draft.progress === undefined) {
    return { ok: true, value: { name, durationDays } };
  }
  return {
    ok: true,
    value: { name, durationDays, progress: clampProgress(Number(draft.progress)) },
  };
}

export type WbsKeyAction = "save" | "cancel" | "moveUp" | "moveDown" | "indent" | "outdent";

/**
 * キー入力をWBS操作に対応付ける。
 * 編集中: Enter=保存 / Esc=キャンセル。
 * Alt+矢印: 行移動・インデント（編集中かどうかによらず有効）。
 */
export function resolveWbsKeyAction(input: {
  key: string;
  altKey: boolean;
  editing: boolean;
}): WbsKeyAction | null {
  if (input.altKey) {
    switch (input.key) {
      case "ArrowUp":
        return "moveUp";
      case "ArrowDown":
        return "moveDown";
      case "ArrowRight":
        return "indent";
      case "ArrowLeft":
        return "outdent";
      default:
        return null;
    }
  }
  if (input.editing) {
    if (input.key === "Enter") return "save";
    if (input.key === "Escape") return "cancel";
  }
  return null;
}

/** ショートカット凡例（表示用） */
export const WBS_SHORTCUTS: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: "Enter", description: "編集中の内容を保存" },
  { keys: "Esc", description: "編集をキャンセル" },
  { keys: "Alt+↑ / Alt+↓", description: "行を上下に移動" },
  { keys: "Alt+→ / Alt+←", description: "インデント / アウトデント" },
];
