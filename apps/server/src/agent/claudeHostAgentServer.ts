import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { z } from "zod";
import {
  createMcpConfigFileFromUrl,
  extractClaudePrintResult,
  runClaudePrintCommand,
} from "./claudeCommand.js";

const RunRequestSchema = z.object({
  prompt: z.string().min(1),
  mcpUrl: z.string().url(),
  timeoutMs: z.number().int().positive().optional(),
  skipPermissions: z.boolean().optional(),
});

export interface ClaudeHostAgentServerOptions {
  host?: string;
  port: number;
  claudeBin: string;
  defaultTimeoutMs: number;
}

export async function startClaudeHostAgentServer(
  options: ClaudeHostAgentServerOptions,
): Promise<{ close: () => Promise<void>; url: string }> {
  const host = options.host ?? "127.0.0.1";
  const execFileAsync = promisify(execFile);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        let claudeVersion = "unknown";
        try {
          const { stdout } = await execFileAsync(options.claudeBin, ["--version"], {
            timeout: 10_000,
          });
          claudeVersion = stdout.trim() || claudeVersion;
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Claude CLI が利用できません" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, claudeVersion }));
        return;
      }

      if (req.method === "POST" && req.url === "/run") {
        const body = await readJsonBody(req);
        const input = RunRequestSchema.parse(body);
        const mcpConfig = createMcpConfigFileFromUrl(input.mcpUrl);
        try {
          const result = await runClaudePrintCommand({
            claudeBin: options.claudeBin,
            prompt: input.prompt,
            mcpConfigPath: mcpConfig.configPath,
            timeoutMs: input.timeoutMs ?? options.defaultTimeoutMs,
            skipPermissions: input.skipPermissions,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ result }));
        } finally {
          mcpConfig.cleanup();
        }
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => resolve());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    req.on("error", reject);
  });
}

export { extractClaudePrintResult };
