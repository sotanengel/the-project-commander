/** AI 応答から JSON オブジェクトを抽出する（フェンス対応） */

function scanForJsonObject(text: string): { value: unknown } | { parseError: string } | null {
  let start = text.indexOf("{");
  let lastParseError: string | null = null;
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          try {
            return { value: JSON.parse(slice) as unknown };
          } catch (e) {
            lastParseError = e instanceof Error ? e.message : String(e);
          }
          break;
        }
      }
    }
    start = text.indexOf("{", start + 1);
  }
  return lastParseError !== null ? { parseError: lastParseError } : null;
}

export class CommentSuggestionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentSuggestionParseError";
  }
}

export function extractJsonFromAiResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new CommentSuggestionParseError("AI 応答が空です");
  }
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fencePattern)) {
    const inner = match[1];
    if (!inner) continue;
    const result = scanForJsonObject(inner);
    if (result && "value" in result) return result.value;
  }
  if (!trimmed.includes("{")) {
    throw new CommentSuggestionParseError("JSON オブジェクトが見つかりません");
  }
  const result = scanForJsonObject(trimmed);
  if (result === null) {
    throw new CommentSuggestionParseError("JSON が途中で終わっています");
  }
  if ("parseError" in result) {
    throw new CommentSuggestionParseError(`JSON の解析に失敗しました: ${result.parseError}`);
  }
  return result.value;
}
