import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

/**
 * 生成AIクライアント向けMCPエンドポイント（Streamable HTTP, /mcp）。
 *
 * 暫定版（基盤スタブ）: ユニット5で @modelcontextprotocol/sdk を使った
 * 本実装（list_projects / get_project_plan / add_tasks 等のツール）に置き換える。
 */
export async function registerMcpRoutes(app: FastifyInstance, _db: Db): Promise<void> {
  app.post("/mcp", async (_req, reply) => {
    return reply.code(501).send({
      jsonrpc: "2.0",
      error: { code: -32601, message: "MCPサーバーは未実装です（ユニット5で実装予定）" },
      id: null,
    });
  });
}
