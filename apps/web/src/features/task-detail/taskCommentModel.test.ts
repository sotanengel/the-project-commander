import { describe, expect, it } from "vitest";
import {
  formatCommentTimeLabels,
  formatCommentTimestamp,
  validateCommentBody,
} from "./taskCommentModel.js";

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

describe("formatCommentTimeLabels", () => {
  it("未更新なら投稿日時のみ", () => {
    const labels = formatCommentTimeLabels("2026-06-13T05:30:00.000Z", null);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatch(/^投稿: 2026/);
  });

  it("更新済みなら更新日時も含める", () => {
    const labels = formatCommentTimeLabels("2026-06-13T05:30:00.000Z", "2026-06-13T06:00:00.000Z");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/^投稿:/);
    expect(labels[1]).toMatch(/^更新:/);
  });
});
