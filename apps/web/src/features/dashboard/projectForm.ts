/** プロジェクト作成フォームの入力検証（純関数） */

/**
 * プロジェクト名を送信前に検証する。
 * 空・空白のみならエラーメッセージを、問題なければ null を返す。
 */
export function validateProjectName(name: string): string | null {
  if (name.trim() === "") return "プロジェクト名を入力してください";
  return null;
}

/**
 * プロジェクト概要を送信前に検証する。
 * 空・空白のみならエラーメッセージを、問題なければ null を返す。
 */
export function validateProjectDescription(description: string): string | null {
  if (description.trim() === "") return "プロジェクトの概要を入力してください";
  return null;
}
