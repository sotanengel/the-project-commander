import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { checkHostAgentHealth } from "./claudeHostClientSession.js";

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
  claudeHostUrl?: string;
  execFileImpl?: typeof execFile;
  fetchImpl?: typeof fetch;
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

/** Docker 等のコンテナ内で動作している可能性が高いか */
export function isLikelyContainerEnvironment(): boolean {
  if (process.env.TPC_IN_CONTAINER === "1") return true;
  if (existsSync("/.dockerenv")) return true;
  try {
    if (existsSync("/proc/1/cgroup") && existsSync("/proc/self/cgroup")) {
      const cgroup = [...readCgroup("/proc/1/cgroup"), ...readCgroup("/proc/self/cgroup")].join(
        "\n",
      );
      if (/docker|containerd|kubepods/i.test(cgroup)) return true;
    }
  } catch {
    // cgroup 読み取り不可の環境では /.dockerenv のみ頼る
  }
  return false;
}

function readCgroup(path: string): string {
  return readFileSync(path, "utf8");
}

export function resolveClaudeHostUrl(raw: string | undefined): string | undefined {
  if (raw?.trim()) return raw.trim().replace(/\/$/, "");
  if (isLikelyContainerEnvironment()) {
    const port = process.env.TPC_CLAUDE_HOST_PORT ?? "9477";
    return `http://host.docker.internal:${port}`;
  }
  return undefined;
}

/** ホストから MCP に到達する URL（Docker 時は公開ポートを使う） */
export function resolveMcpPublicUrl(port: number): string {
  const explicit = process.env.TPC_MCP_PUBLIC_URL?.trim();
  if (explicit) return explicit;
  return `http://127.0.0.1:${port}/mcp`;
}

/** claude CLI / ホストエージェントの実行可能性を確認する */
export async function checkCliAgentStatus(options: CliAgentStatusOptions): Promise<CliAgentStatus> {
  if (options.provider === "off") {
    return {
      provider: "off",
      ready: false,
      mcpConnected: false,
      message: "TPC_CLI_AGENT=off のため無効です",
    };
  }

  if (options.claudeHostUrl) {
    const health = await checkHostAgentHealth(options.claudeHostUrl, options.fetchImpl);
    if (!health.ok) {
      return {
        provider: "claude",
        ready: false,
        mcpConnected: false,
        message:
          health.message ??
          "ホスト Claude エージェントに接続できません。`pnpm start` で起動しているか確認してください。",
      };
    }
    return {
      provider: "claude",
      ready: true,
      mcpConnected: true,
      message: health.message ?? "ホスト Claude エージェント経由",
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
  claudeHostUrl?: string;
  mcpPublicUrl: string;
} {
  const port = Number(process.env.PORT ?? 3000);
  return {
    provider: resolveCliAgentProvider(process.env.TPC_CLI_AGENT),
    claudeBin: process.env.TPC_CLAUDE_BIN ?? "claude",
    timeoutMs: Number(process.env.TPC_CLAUDE_TIMEOUT_MS ?? 120_000),
    port,
    skipPermissions: isTruthyEnv(process.env.TPC_CLAUDE_SKIP_PERMISSIONS, true),
    claudeHostUrl: resolveClaudeHostUrl(process.env.TPC_CLAUDE_HOST),
    mcpPublicUrl: resolveMcpPublicUrl(port),
  };
}
