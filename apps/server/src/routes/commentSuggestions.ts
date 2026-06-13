import { CommentSuggestionAnalyzeInputSchema } from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { AnalyzeCommentError } from "../agent/analyzeComment.js";
import type { LocalAgentService } from "../agent/index.js";
import type { Db } from "../db.js";
import { getTask } from "../repositories/task.js";

export default async function commentSuggestionRoutes(
  app: FastifyInstance,
  { db, localAgent }: { db: Db; localAgent: LocalAgentService },
) {
  app.get("/api/agent/status", async () => localAgent.getStatus());

  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/comment-suggestions",
    async (req, reply) => {
      const status = localAgent.getStatus();
      if (!status.ready) {
        return reply.code(503).send({
          error: status.message ?? "ローカル LLM エージェントが利用できません",
        });
      }

      const task = getTask(db, req.params.taskId);
      if (!task) {
        return reply.code(404).send({ error: "タスクが見つかりません" });
      }

      const body = CommentSuggestionAnalyzeInputSchema.parse(req.body);
      if (body.projectId !== task.projectId) {
        return reply.code(404).send({ error: "タスクが見つかりません" });
      }

      try {
        const { suggestions, meta } = await localAgent.analyzeComment(db, {
          projectId: body.projectId,
          taskId: req.params.taskId,
          commentBody: body.commentBody,
        });
        return { suggestions, meta };
      } catch (e) {
        if (e instanceof AnalyzeCommentError) {
          if (e.kind === "not_found") {
            return reply.code(404).send({ error: e.message });
          }
          return reply.code(502).send({ error: e.message });
        }
        app.log.error(e);
        return reply.code(502).send({ error: "AI 分析に失敗しました" });
      }
    },
  );
}
