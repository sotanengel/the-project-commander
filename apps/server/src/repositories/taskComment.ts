import { type TaskComment, TaskCommentSchema } from "@tpc/shared";
import { type Db, newId } from "../db.js";

export function listCommentsByTask(db: Db, taskId: string): TaskComment[] {
  return TaskCommentSchema.array().parse(
    db.prepare("SELECT * FROM task_comments WHERE taskId = ? ORDER BY createdAt ASC").all(taskId),
  );
}

export function listCommentsByProject(db: Db, projectId: string): TaskComment[] {
  return TaskCommentSchema.array().parse(
    db
      .prepare(
        `SELECT c.* FROM task_comments c
         INNER JOIN tasks t ON t.id = c.taskId
         WHERE t.projectId = ?
         ORDER BY c.createdAt ASC`,
      )
      .all(projectId),
  );
}

export function insertComment(db: Db, taskId: string, body: string): TaskComment {
  const comment = TaskCommentSchema.parse({
    id: newId(),
    taskId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  });
  db.prepare(
    "INSERT INTO task_comments (id, taskId, body, createdAt) VALUES (@id, @taskId, @body, @createdAt)",
  ).run(comment);
  return comment;
}
