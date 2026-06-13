import type { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";
import { checkCliAgentStatus, resolveCliAgentProvider } from "./cliAgentStatus.js";

describe("resolveCliAgentProvider", () => {
  it("未設定時は auto", () => {
    expect(resolveCliAgentProvider(undefined)).toBe("auto");
  });

  it("off で無効化", () => {
    expect(resolveCliAgentProvider("off")).toBe("off");
  });

  it("claude で明示有効", () => {
    expect(resolveCliAgentProvider("claude")).toBe("claude");
  });
});

describe("checkCliAgentStatus auto", () => {
  it("auto で CLI が見つからない場合は off 相当のメッセージ", async () => {
    const status = await checkCliAgentStatus({
      provider: "auto",
      claudeBin: "no-such-claude-binary",
      execFileImpl: ((
        _file: string,
        _args: readonly string[],
        _opts: object,
        cb: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error("not found"), "", "");
      }) as typeof execFile,
    });
    expect(status.ready).toBe(false);
    expect(status.provider).toBe("off");
    expect(status.message).toContain("Claude CLI が見つかりません");
  });
});
