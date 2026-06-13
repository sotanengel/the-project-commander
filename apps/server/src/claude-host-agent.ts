import { startClaudeHostAgentServer } from "./agent/claudeHostAgentServer.js";

const port = Number(process.env.TPC_CLAUDE_HOST_PORT ?? 9477);
const claudeBin = process.env.TPC_CLAUDE_BIN ?? "claude";
const timeoutMs = Number(process.env.TPC_CLAUDE_TIMEOUT_MS ?? 120_000);

async function main() {
  const server = await startClaudeHostAgentServer({
    port,
    claudeBin,
    defaultTimeoutMs: timeoutMs,
  });
  console.log(`Claude host agent listening on ${server.url}`);
}

main().catch((err) => {
  console.error("Claude host agent failed:", err);
  process.exit(1);
});
