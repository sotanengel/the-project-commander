export type CommentBodyValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** 進捗コメント本文を検証する（trim 後非空） */
export function validateCommentBody(body: string): CommentBodyValidationResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, error: "コメントを入力してください" };
  }
  return { ok: true, value: trimmed };
}

/** ISO 8601 を表示用にフォーマットする */
export function formatCommentTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
