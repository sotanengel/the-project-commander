import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface McpConfigPaths {
  configPath: string;
  cleanup: () => void;
}

/** Claude CLI 用 MCP 設定ファイルを生成する */
export function createMcpConfigFile(port: number): McpConfigPaths {
  const dir = mkdtempSync(join(tmpdir(), "tpc-mcp-"));
  const configPath = join(dir, "mcp.json");
  const config = {
    mcpServers: {
      "the-project-commander": {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return {
    configPath,
    cleanup: () => {
      try {
        writeFileSync(configPath, "", "utf8");
      } catch {
        // テスト終了時のクリーンアップ失敗は無視
      }
    },
  };
}

export function buildMcpConfigContent(port: number): string {
  return JSON.stringify(
    {
      mcpServers: {
        "the-project-commander": {
          type: "http",
          url: `http://127.0.0.1:${port}/mcp`,
        },
      },
    },
    null,
    2,
  );
}
