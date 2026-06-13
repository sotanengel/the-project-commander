import type { CommentSuggestion } from "@tpc/shared";
import { api } from "../../api/client.js";

export interface SuggestionApplier {
  updateTask: typeof api.updateTask;
  createDependency: typeof api.createDependency;
  updateMilestone: typeof api.updateMilestone;
}

const defaultApplier: SuggestionApplier = {
  updateTask: api.updateTask.bind(api),
  createDependency: api.createDependency.bind(api),
  updateMilestone: api.updateMilestone.bind(api),
};

/** 提案内容を一覧表示用の行に変換する */
export function describeSuggestionChanges(suggestion: CommentSuggestion): string[] {
  if (suggestion.kind === "update_task") {
    return Object.entries(suggestion.changes).map(([key, value]) => `${key}: ${String(value)}`);
  }
  if (suggestion.kind === "create_dependency") {
    const d = suggestion.dependency;
    return [
      `predecessorId: ${d.predecessorId}`,
      `successorId: ${d.successorId}`,
      `type: ${d.type ?? "FS"}`,
      `lagDays: ${d.lagDays ?? 0}`,
    ];
  }
  if (suggestion.kind === "update_milestone") {
    return Object.entries(suggestion.changes).map(([key, value]) => `${key}: ${String(value)}`);
  }
  return [];
}

export async function applySuggestion(
  suggestion: CommentSuggestion,
  projectId: string,
  applier: SuggestionApplier = defaultApplier,
): Promise<void> {
  switch (suggestion.kind) {
    case "update_task":
      await applier.updateTask(suggestion.taskId, suggestion.changes);
      return;
    case "create_dependency":
      await applier.createDependency(projectId, suggestion.dependency);
      return;
    case "update_milestone":
      await applier.updateMilestone(suggestion.milestoneId, suggestion.changes);
      return;
    default: {
      const _exhaustive: never = suggestion;
      throw new Error(`未対応の提案種別: ${String(_exhaustive)}`);
    }
  }
}
