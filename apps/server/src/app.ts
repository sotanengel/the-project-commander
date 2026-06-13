import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { CycleError } from "@tpc/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Db } from "./db.js";
import { registerMcpRoutes } from "./mcp/index.js";
import baselineRoutes from "./routes/baselines.js";
import dependencyRoutes from "./routes/dependencies.js";
import exportRoutes from "./routes/export.js";
import milestoneRoutes from "./routes/milestones.js";
import planDraftRoutes from "./routes/plan-draft.js";
import projectRoutes from "./routes/projects.js";
import riskRoutes from "./routes/risks.js";
import stakeholderRoutes from "./routes/stakeholders.js";
import taskCommentRoutes from "./routes/taskComments.js";
import taskRoutes from "./routes/tasks.js";

export async function buildApp(db: Db): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "入力が不正です",
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (error instanceof CycleError) {
      return reply.code(409).send({ error: error.message });
    }
    app.log.error(error);
    const fe = error as { statusCode?: number; message?: string };
    const statusCode =
      typeof fe.statusCode === "number" && fe.statusCode >= 400 ? fe.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "サーバーエラーが発生しました" : (fe.message ?? "エラー"),
    });
  });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(projectRoutes, { db });
  await app.register(planDraftRoutes, { db });
  await app.register(taskRoutes, { db });
  await app.register(taskCommentRoutes, { db });
  await app.register(dependencyRoutes, { db });
  await app.register(milestoneRoutes, { db });
  await app.register(riskRoutes, { db });
  await app.register(stakeholderRoutes, { db });
  await app.register(baselineRoutes, { db });
  await app.register(exportRoutes, { db });
  await registerMcpRoutes(app, db);

  // ビルド済みSPAの配信（apps/web/dist が存在する場合のみ）
  const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/mcp")) {
        return reply.code(404).send({ error: "Not Found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
