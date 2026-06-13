import { describe, expect, it } from "vitest";
import { formatCommentTimestamp, validateCommentBody } from "./taskCommentModel.js";

describe("validateCommentBody", () => {
  it("trim 後非空なら ok", () => {
    const result = validateCommentBody("  進捗50%  ");
    expect(result).toEqual({ ok: true, value: "進捗50%" });
  });

  it("空文字・空白のみはエラー", () => {
    expect(validateCommentBody("")).toEqual({ ok: false, error: "コメントを入力してください" });
    expect(validateCommentBody("   ")).toEqual({ ok: false, error: "コメントを入力してください" });
  });
});

describe("formatCommentTimestamp", () => {
  it("ISO 8601 を日本語ロケールで表示する", () => {
    const formatted = formatCommentTimestamp("2026-06-13T05:30:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("06");
    expect(formatted).toContain("13");
  });

  it("不正な日付はそのまま返す", () => {
    expect(formatCommentTimestamp("invalid")).toBe("invalid");
  });
});
