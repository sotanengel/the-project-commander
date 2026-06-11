import type { Baseline, BaselineTask } from "@tpc/shared";
import type { Db } from "../db.js";

export interface BaselineRow {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  data: string;
}

export function rowToBaseline(row: BaselineRow): Baseline {
  const data = JSON.parse(row.data) as { projectDuration: number; tasks: BaselineTask[] };
  return {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    createdAt: row.createdAt,
    projectDuration: data.projectDuration,
    tasks: data.tasks,
  };
}

export function listBaselineRows(db: Db, projectId: string): BaselineRow[] {
  return db
    .prepare("SELECT * FROM baselines WHERE projectId = ? ORDER BY createdAt DESC")
    .all(projectId) as BaselineRow[];
}

export function listBaselines(db: Db, projectId: string): Baseline[] {
  return listBaselineRows(db, projectId).map(rowToBaseline);
}
