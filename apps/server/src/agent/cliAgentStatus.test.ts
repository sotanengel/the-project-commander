import type { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkCliAgentStatus,
  isLikelyContainerEnvironment,
  resolveClaudeHostUrl,
  resolveCliAgentProvider,
  resolveMcpPublicUrl,
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

describe("resolveClaudeHostUrl", () => {
  it("明示 URL を優先する", () => {
    expect(resolveClaudeHostUrl("http://127.0.0.1:9999")).toBe("http://127.0.0.1:9999");
  });

  it("コンテナ内では host.docker.internal を使う", () => {
    const previous = process.env.TPC_IN_CONTAINER;
    process.env.TPC_IN_CONTAINER = "1";
    try {
      expect(resolveClaudeHostUrl(undefined)).toBe("http://host.docker.internal:9477");
    } finally {
      if (previous === undefined) process.env.TPC_IN_CONTAINER = undefined;
      else process.env.TPC_IN_CONTAINER = previous;
    }
  });
});

describe("resolveMcpPublicUrl", () => {
  it("TPC_MCP_PUBLIC_URL を優先する", () => {
    const previous = process.env.TPC_MCP_PUBLIC_URL;
    process.env.TPC_MCP_PUBLIC_URL = "http://127.0.0.1:3001/mcp";
    try {
      expect(resolveMcpPublicUrl(3000)).toBe("http://127.0.0.1:3001/mcp");
    } finally {
      if (previous === undefined) process.env.TPC_MCP_PUBLIC_URL = undefined;
      else process.env.TPC_MCP_PUBLIC_URL = previous;
    }
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

  it("ホストエージェント URL 指定時は health を確認する", async () => {
    const status = await checkCliAgentStatus({
      provider: "auto",
      claudeBin: "claude",
      claudeHostUrl: "http://127.0.0.1:9477",
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, claudeVersion: "2.1.0" }),
        }) as Response,
    });
    expect(status.ready).toBe(true);
    expect(status.message).toContain("Claude");
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
