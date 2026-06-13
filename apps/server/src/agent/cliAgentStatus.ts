import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CliAgentStatus {
  provider: "claude" | "off";
  ready: boolean;
  mcpConnected: boolean;
  message?: string;
}

export interface CliAgentStatusOptions {
  provider: string;
  claudeBin: string;
  execFileImpl?: typeof execFile;
}

/** claude CLI の実行可能性を確認する */
export async function checkCliAgentStatus(options: CliAgentStatusOptions): Promise<CliAgentStatus> {
  if (options.provider !== "claude") {
    return {
      provider: "off",
      ready: false,
      mcpConnected: false,
      message: "TPC_CLI_AGENT が無効です",
    };
  }

  const execFileImpl = options.execFileImpl ?? execFile;
  const execFileAsyncImpl = promisify(execFileImpl);

  try {
    await execFileAsyncImpl(options.claudeBin, ["--version"], {
      timeout: 10_000,
      env: process.env,
    });
    return {
      provider: "claude",
      ready: true,
      mcpConnected: true,
      message: "Claude CLI を利用可能",
    };
  } catch (e) {
    return {
      provider: "claude",
      ready: false,
      mcpConnected: false,
      message: e instanceof Error ? e.message : "Claude CLI を起動できません",
    };
  }
}

export function readCliAgentEnv(): {
  provider: string;
  claudeBin: string;
  timeoutMs: number;
  port: number;
} {
  return {
    provider: process.env.TPC_CLI_AGENT ?? "off",
    claudeBin: process.env.TPC_CLAUDE_BIN ?? "claude",
    timeoutMs: Number(process.env.TPC_CLAUDE_TIMEOUT_MS ?? 120_000),
    port: Number(process.env.PORT ?? 3000),
  };
}
