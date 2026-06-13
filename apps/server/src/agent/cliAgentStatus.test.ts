import type { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkCliAgentStatus,
  isLikelyContainerEnvironment,
  resolveCliAgentProvider,
} from "./cliAgentStatus.js";

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

  it("コンテナ環境では CLI 探索前に無効化する", async () => {
    const previous = process.env.TPC_IN_CONTAINER;
    process.env.TPC_IN_CONTAINER = "1";
    try {
      const status = await checkCliAgentStatus({
        provider: "auto",
        claudeBin: "claude",
      });
      expect(status.ready).toBe(false);
      expect(status.message).toContain("Docker コンテナ内");
    } finally {
      if (previous === undefined) process.env.TPC_IN_CONTAINER = undefined;
      else process.env.TPC_IN_CONTAINER = previous;
    }
  });
});

describe("isLikelyContainerEnvironment", () => {
  it("TPC_IN_CONTAINER=1 で true", () => {
    const previous = process.env.TPC_IN_CONTAINER;
    process.env.TPC_IN_CONTAINER = "1";
    try {
      expect(isLikelyContainerEnvironment()).toBe(true);
    } finally {
      if (previous === undefined) process.env.TPC_IN_CONTAINER = undefined;
      else process.env.TPC_IN_CONTAINER = previous;
    }
  });
});
