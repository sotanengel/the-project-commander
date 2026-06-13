import type { ProjectPlan } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 計画内の taskId を解決（UUID またはタスク名） */
export function resolveTaskIdInPlan(raw: string, plan: ProjectPlan): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (plan.tasks.some((t) => t.id === trimmed)) {
    return trimmed;
  }

  const byName = plan.tasks.filter((t) => t.name.trim() === trimmed);
  if (byName.length === 1) {
    return byName[0]?.id;
  }

  return undefined;
}

/** 計画内の milestoneId を解決（UUID またはマイルストーン名） */
export function resolveMilestoneIdInPlan(raw: string, plan: ProjectPlan): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (plan.milestones.some((m) => m.id === trimmed)) {
    return trimmed;
  }

  const byName = plan.milestones.filter((m) => m.name.trim() === trimmed);
  if (byName.length === 1) {
    return byName[0]?.id;
  }

  return undefined;
}

/** 生 suggestion オブジェクトの ID 参照を計画内 UUID に正規化 */
export function resolveSuggestionIdsInRaw(item: unknown, plan: ProjectPlan): unknown {
  if (!isRecord(item)) return item;

  const out = { ...item };
  const kind = out.kind;

  if (kind === "update_task" && typeof out.taskId === "string") {
    const resolved = resolveTaskIdInPlan(out.taskId, plan);
    if (resolved) out.taskId = resolved;
  }

  if (kind === "update_milestone" && typeof out.milestoneId === "string") {
    const resolved = resolveMilestoneIdInPlan(out.milestoneId, plan);
    if (resolved) out.milestoneId = resolved;
  }

  if (kind === "create_dependency" && isRecord(out.dependency)) {
    const dep = { ...out.dependency };
    if (typeof dep.predecessorId === "string") {
      const resolved = resolveTaskIdInPlan(dep.predecessorId, plan);
      if (resolved) dep.predecessorId = resolved;
    }
    if (typeof dep.successorId === "string") {
      const resolved = resolveTaskIdInPlan(dep.successorId, plan);
      if (resolved) dep.successorId = resolved;
    }
    out.dependency = dep;
  }

  return out;
}
