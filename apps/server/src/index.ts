import { createCliAgentService } from "./agent/index.js";
import { buildApp } from "./app.js";
import { createDb } from "./db.js";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? "./data/tpc.db";

async function main() {
  const db = createDb(DB_PATH);
  const cliAgent = createCliAgentService();
  await cliAgent.init();
  const app = await buildApp(db, { cliAgent });
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    await cliAgent.stop();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("起動に失敗しました:", err);
  process.exit(1);
});
