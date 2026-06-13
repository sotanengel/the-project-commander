import { describe, expect, it } from "vitest";
import { extractClaudePrintResult, formatClaudeCliFailureMessage } from "./claudeCommand.js";

describe("extractClaudePrintResult", () => {
  it("is_error の result を例外メッセージにする", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: true,
      result: "Invalid API key · Fix external API key",
    });
    expect(() => extractClaudePrintResult(stdout)).toThrow(
      "Invalid API key · Fix external API key",
    );
  });
});

describe("formatClaudeCliFailureMessage", () => {
  it("終了コード非0でも stdout の JSON から result を取り出す", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Invalid API key · Fix external API key",
    });
    expect(formatClaudeCliFailureMessage(stdout, "", 1)).toBe(
      "Invalid API key · Fix external API key",
    );
  });

  it("JSON でなければ stderr を優先する", () => {
    expect(formatClaudeCliFailureMessage("", "permission denied", 1)).toBe("permission denied");
  });
});
