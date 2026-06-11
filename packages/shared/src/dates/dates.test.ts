import { describe, expect, it } from "vitest";
import { diffDays, parseDateString, toDayMs, todayLocal } from "./index.js";

describe("dates", () => {
  it("parseDateString は UTC 正午基準で解釈する", () => {
    const date = parseDateString("2025-06-15");
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(5);
    expect(date.getUTCDate()).toBe(15);
  });

  it("diffDays は YYYY-MM-DD 同士の日数差を返す", () => {
    expect(diffDays("2025-01-01", "2025-01-04")).toBe(3);
    expect(diffDays("2025-01-04", "2025-01-01")).toBe(-3);
  });

  it("toDayMs は Date と文字列の両方を UTC 日付基準に正規化する", () => {
    expect(toDayMs("2025-03-01", "基準日")).toBe(Date.UTC(2025, 2, 1));
    expect(toDayMs(new Date(Date.UTC(2025, 2, 1, 12, 0, 0)), "基準日")).toBe(Date.UTC(2025, 2, 1));
  });

  it("todayLocal はローカル日付の YYYY-MM-DD を返す", () => {
    expect(todayLocal(new Date(2025, 5, 11, 23, 59, 0))).toBe("2025-06-11");
  });

  it("不正な日付文字列は RangeError を投げる", () => {
    expect(() => parseDateString("2025/06/15")).toThrow(RangeError);
    expect(() => toDayMs("invalid", "基準日")).toThrow(RangeError);
  });
});
