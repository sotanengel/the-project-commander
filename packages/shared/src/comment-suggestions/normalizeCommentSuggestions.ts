const KIND_ALIASES: Record<string, "update_task" | "create_dependency" | "update_milestone"> = {
  update_task: "update_task",
  updatetask: "update_task",
  task_update: "update_task",
  update: "update_task",
  modify_task: "update_task",
  task: "update_task",
  create_dependency: "create_dependency",
  createdependency: "create_dependency",
  dependency: "create_dependency",
  add_dependency: "create_dependency",
  new_dependency: "create_dependency",
  update_milestone: "update_milestone",
  updatemilestone: "update_milestone",
  milestone_update: "update_milestone",
  milestone: "update_milestone",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKindKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}

function inferKind(obj: Record<string, unknown>): string | undefined {
  if (obj.dependency !== undefined) return "create_dependency";
  if (obj.milestoneId !== undefined) return "update_milestone";
  if (obj.taskId !== undefined && obj.changes !== undefined) return "update_task";
  return undefined;
}

function resolveKind(obj: Record<string, unknown>): string | undefined {
  const rawKind = obj.kind ?? obj.type ?? obj.action;
  if (typeof rawKind === "string" && rawKind.trim()) {
    const normalized = normalizeKindKey(rawKind);
    return KIND_ALIASES[normalized] ?? normalized;
  }
  return inferKind(obj);
}

function ensureSuggestionBase(
  obj: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const out = { ...obj };
  if (typeof out.id !== "string" || !out.id.trim()) {
    out.id = `suggestion-${index + 1}`;
  }
  if (typeof out.label !== "string" || !out.label.trim()) {
    out.label = "計画変更";
  }
  if (typeof out.rationale !== "string" || !out.rationale.trim()) {
    out.rationale = "コメント内容に基づく変更";
  }
  return out;
}

/** AI 応答の生オブジェクトから suggestions 配列を取り出す */
export function extractSuggestionItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  if (Array.isArray(raw.suggestions)) return raw.suggestions;
  if (
    raw.kind !== undefined ||
    raw.type !== undefined ||
    raw.action !== undefined ||
    raw.taskId !== undefined ||
    raw.dependency !== undefined ||
    raw.milestoneId !== undefined
  ) {
    return [raw];
  }
  return [];
}

/** 小さい LLM の表記ゆれを吸収して Zod 検証用に正規化する */
export function normalizeSuggestionRaw(item: unknown, index: number): unknown {
  if (!isRecord(item)) return item;
  const kind = resolveKind(item);
  const base = ensureSuggestionBase(item, index);
  if (!kind) return base;
  return { ...base, kind };
}
