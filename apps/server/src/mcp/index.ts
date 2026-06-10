import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import { createMcpServer } from "./server.js";

/**
 * 生成AIクライアント向けMCPエンドポイント（Streamable HTTP, /mcp）。
 */
export async function registerMcpRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.post("/mcp", async (req, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const mcpServer = createMcpServer(db);
    await mcpServer.connect(transport);
    reply.hijack();
    try {
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      await transport.close();
      await mcpServer.close();
    }
  });

  app.get("/mcp", async (_req, reply) => {
    return reply.code(405).send({ error: "Method Not Allowed" });
  });

  app.delete("/mcp", async (_req, reply) => {
    return reply.code(405).send({ error: "Method Not Allowed" });
  });
}
