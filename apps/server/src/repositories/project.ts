import {
  DependencySchema,
  MilestoneSchema,
  type ProjectPlan,
  ProjectSchema,
  TaskSchema,
  computeCpm,
} from "@tpc/shared";
import type { Db } from "../db.js";

export function projectExists(db: Db, projectId: string): boolean {
  return db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
}

export function loadProjectPlan(db: Db, projectId: string): ProjectPlan | null {
  const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!projectRow) return null;
  const project = ProjectSchema.parse(projectRow);
  const tasks = TaskSchema.array().parse(
    db.prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder").all(projectId),
  );
  const dependencies = DependencySchema.array().parse(
    db.prepare("SELECT * FROM dependencies WHERE projectId = ?").all(projectId),
  );
  const milestones = MilestoneSchema.array().parse(
    db.prepare("SELECT * FROM milestones WHERE projectId = ? ORDER BY dueDate").all(projectId),
  );
  return {
    project,
    tasks,
    dependencies,
    milestones,
    cpm: computeCpm(tasks, dependencies),
  };
}
