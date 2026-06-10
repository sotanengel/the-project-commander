import {
  type Dependency,
  type Milestone,
  type Project,
  ProjectCreateSchema,
  type ProjectPlan,
  ProjectSchema,
  type Task,
  computeCpm,
} from "@tpc/shared";
import type { FastifyInstance } from "fastify";
import { type Db, newId } from "../db.js";

export default async function projectRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get("/api/projects", async () => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC").all();
    return rows.map((r) => ProjectSchema.parse(r));
  });

  app.post("/api/projects", async (req, reply) => {
    const input = ProjectCreateSchema.parse(req.body);
    const project: Project = {
      id: newId(),
      name: input.name,
      description: input.description ?? "",
      startDate: input.startDate,
      createdAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO projects (id, name, description, startDate, createdAt) VALUES (@id, @name, @description, @startDate, @createdAt)",
    ).run(project);
    reply.code(201);
    return project;
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!row) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    return ProjectSchema.parse(row);
  });

  app.put<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const existing = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    const input = ProjectCreateSchema.partial().parse(req.body);
    const updated = ProjectSchema.parse({ ...existing, ...input });
    db.prepare(
      "UPDATE projects SET name = @name, description = @description, startDate = @startDate WHERE id = @id",
    ).run(updated);
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    if (result.changes === 0)
      return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/plan", async (req, reply) => {
    const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!projectRow) return reply.code(404).send({ error: "プロジェクトが見つかりません" });
    const project = ProjectSchema.parse(projectRow);
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder")
      .all(req.params.id) as Task[];
    const dependencies = db
      .prepare("SELECT * FROM dependencies WHERE projectId = ?")
      .all(req.params.id) as Dependency[];
    const milestones = db
      .prepare("SELECT * FROM milestones WHERE projectId = ? ORDER BY dueDate")
      .all(req.params.id) as Milestone[];
    const plan: ProjectPlan = {
      project,
      tasks,
      dependencies,
      milestones,
      cpm: computeCpm(tasks, dependencies),
    };
    return plan;
  });
}
