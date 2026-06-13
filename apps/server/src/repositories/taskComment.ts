import { type TaskComment, TaskCommentSchema } from "@tpc/shared";
import { type Db, newId } from "../db.js";

function parseCommentRow(row: unknown): TaskComment {
  const raw = row as Record<string, unknown>;
  return TaskCommentSchema.parse({
    ...raw,
    updatedAt: raw.updatedAt ?? null,
  });
}

export function getComment(db: Db, id: string): TaskComment | undefined {
  const row = db.prepare("SELECT * FROM task_comments WHERE id = ?").get(id);
  if (!row) return undefined;
  return parseCommentRow(row);
}

export function listCommentsByTask(db: Db, taskId: string): TaskComment[] {
  return db
    .prepare("SELECT * FROM task_comments WHERE taskId = ? ORDER BY createdAt ASC")
    .all(taskId)
    .map(parseCommentRow);
}

export function listCommentsByProject(db: Db, projectId: string): TaskComment[] {
  return db
    .prepare(
      `SELECT c.* FROM task_comments c
       INNER JOIN tasks t ON t.id = c.taskId
       WHERE t.projectId = ?
       ORDER BY c.createdAt ASC`,
    )
    .all(projectId)
    .map(parseCommentRow);
}

export function insertComment(db: Db, taskId: string, body: string): TaskComment {
  const comment = TaskCommentSchema.parse({
    id: newId(),
    taskId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: null,
  });
  db.prepare(
    "INSERT INTO task_comments (id, taskId, body, createdAt, updatedAt) VALUES (@id, @taskId, @body, @createdAt, @updatedAt)",
  ).run(comment);
  return comment;
}

export function updateComment(db: Db, id: string, body: string): TaskComment | undefined {
  const existing = getComment(db, id);
  if (!existing) return undefined;
  const updated = TaskCommentSchema.parse({
    ...existing,
    body: body.trim(),
    updatedAt: new Date().toISOString(),
  });
  db.prepare("UPDATE task_comments SET body = @body, updatedAt = @updatedAt WHERE id = @id").run({
    id,
    body: updated.body,
    updatedAt: updated.updatedAt,
  });
  return updated;
}

export function deleteComment(db: Db, id: string): boolean {
  const result = db.prepare("DELETE FROM task_comments WHERE id = ?").run(id);
  return result.changes > 0;
}
