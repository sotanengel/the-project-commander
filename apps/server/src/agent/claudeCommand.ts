import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMENT_SUGGESTION_ALLOWED_MCP_TOOLS } from "@tpc/shared";

export interface ClaudePrintResponse {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

export interface RunClaudePrintCommandOptions {
  claudeBin: string;
  prompt: string;
  mcpConfigPath: string;
  timeoutMs: number;
  skipPermissions?: boolean;
  allowedTools?: readonly string[];
  spawnImpl?: typeof spawn;
}

export function createMcpConfigFileFromUrl(mcpUrl: string): {
  configPath: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "tpc-mcp-"));
  const configPath = join(dir, "mcp.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mcpServers: {
          "the-project-commander": {
            type: "http",
            url: mcpUrl,
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return { configPath, cleanup: () => {} };
}

export function runClaudePrintCommand(options: RunClaudePrintCommandOptions): Promise<string> {
  const spawnImpl = options.spawnImpl ?? spawn;
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    "json",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--mcp-config",
    options.mcpConfigPath,
  ];

  const allowedTools =
    options.allowedTools ??
    (options.prompt !== "/reset" ? COMMENT_SUGGESTION_ALLOWED_MCP_TOOLS : undefined);

  if (allowedTools && allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  if (options.skipPermissions !== false) {
    args.push("--dangerously-skip-permissions");
  }

  return new Promise((resolve, reject) => {
    const child = spawnImpl(options.claudeBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude CLI がタイムアウトしました (${options.timeoutMs}ms)`));
    }, options.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `Claude CLI が終了コード ${code} で終了しました`,
          ),
        );
        return;
      }
      try {
        resolve(extractClaudePrintResult(stdout));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

export function extractClaudePrintResult(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Claude CLI の出力が空です");
  }

  let parsed: ClaudePrintResponse;
  try {
    parsed = JSON.parse(trimmed) as ClaudePrintResponse;
  } catch {
    return trimmed;
  }

  if (parsed.is_error) {
    throw new Error(parsed.result?.trim() || "Claude CLI がエラーを返しました");
  }

  if (typeof parsed.result === "string") {
    return parsed.result;
  }

  return trimmed;
}
