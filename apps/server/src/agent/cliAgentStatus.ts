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

/** 環境変数 TPC_CLI_AGENT を解決する（未設定時は auto） */
export function resolveCliAgentProvider(raw: string | undefined): "claude" | "off" | "auto" {
  const value = (raw ?? "auto").trim().toLowerCase();
  if (value === "off" || value === "false" || value === "0") return "off";
  if (value === "claude" || value === "on" || value === "true" || value === "1") return "claude";
  return "auto";
}

function isTruthyEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  if (normalized === "1" || normalized === "true" || normalized === "on") return true;
  return defaultValue;
}

/** claude CLI の実行可能性を確認する */
export async function checkCliAgentStatus(options: CliAgentStatusOptions): Promise<CliAgentStatus> {
  if (options.provider === "off") {
    return {
      provider: "off",
      ready: false,
      mcpConnected: false,
      message: "TPC_CLI_AGENT=off のため無効です",
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
    const detail = e instanceof Error ? e.message : "Claude CLI を起動できません";
    if (options.provider === "auto") {
      return {
        provider: "off",
        ready: false,
        mcpConnected: false,
        message: `Claude CLI が見つかりません（${options.claudeBin}）。インストールと PATH を確認してください。`,
      };
    }
    return {
      provider: "claude",
      ready: false,
      mcpConnected: false,
      message: detail,
    };
  }
}

export function readCliAgentEnv(): {
  provider: "claude" | "off" | "auto";
  claudeBin: string;
  timeoutMs: number;
  port: number;
  skipPermissions: boolean;
} {
  return {
    provider: resolveCliAgentProvider(process.env.TPC_CLI_AGENT),
    claudeBin: process.env.TPC_CLAUDE_BIN ?? "claude",
    timeoutMs: Number(process.env.TPC_CLAUDE_TIMEOUT_MS ?? 120_000),
    port: Number(process.env.PORT ?? 3000),
    skipPermissions: isTruthyEnv(process.env.TPC_CLAUDE_SKIP_PERMISSIONS, true),
  };
}
