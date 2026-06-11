import { type Task, TaskSchema } from "@tpc/shared";
import { BulkBodySchema, type BulkTaskInput } from "@tpc/shared";
import { type Db, newId } from "../db.js";

export { BulkBodySchema, BulkTaskSchema, type BulkTaskInput } from "@tpc/shared";

export function getTask(db: Db, id: string): Task | undefined {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!row) return undefined;
  return TaskSchema.parse(row);
}

export function listTasks(db: Db, projectId: string): Task[] {
  return TaskSchema.array().parse(
    db.prepare("SELECT * FROM tasks WHERE projectId = ? ORDER BY sortOrder").all(projectId),
  );
}

export function nextSortOrder(db: Db, projectId: string, parentId: string | null): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sortOrder), -1) + 1 AS next FROM tasks WHERE projectId = ? AND parentId IS ?",
    )
    .get(projectId, parentId) as { next: number };
  return row.next;
}

export function createTaskRepository(db: Db) {
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, projectId, parentId, name, description, durationDays, progress, assignee, sortOrder)
     VALUES (@id, @projectId, @parentId, @name, @description, @durationDays, @progress, @assignee, @sortOrder)`,
  );

  function insertTaskTree(
    projectId: string,
    items: BulkTaskInput[],
    parentId: string | null,
  ): Task[] {
    const created: Task[] = [];
    const walk = (nodes: BulkTaskInput[], parent: string | null) => {
      let order = nextSortOrder(db, projectId, parent);
      for (const node of nodes) {
        const { children, ...fields } = node;
        const task = TaskSchema.parse({
          ...fields,
          id: newId(),
          projectId,
          parentId: parent,
          sortOrder: order++,
        });
        insertTask.run(task);
        created.push(task);
        if (children && children.length > 0) walk(children, task.id);
      }
    };
    walk(items, parentId);
    return created;
  }

  return { insertTask, insertTaskTree };
}
