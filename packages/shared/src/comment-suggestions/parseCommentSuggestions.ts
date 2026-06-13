import type { ProjectPlan } from "../types.js";
import { extractJsonFromAiResponse } from "./extractJson.js";
import { extractSuggestionItems, normalizeSuggestionRaw } from "./normalizeCommentSuggestions.js";
import { type CommentSuggestion, CommentSuggestionSchema } from "./schemas.js";

export { CommentSuggestionParseError } from "./extractJson.js";

function taskIds(plan: ProjectPlan): Set<string> {
  return new Set(plan.tasks.map((t) => t.id));
}

function milestoneIds(plan: ProjectPlan): Set<string> {
  return new Set(plan.milestones.map((m) => m.id));
}

/** 計画内 ID のみ残す。不正な提案は除外する */
export function validateSuggestionsAgainstPlan(
  suggestions: CommentSuggestion[],
  plan: ProjectPlan,
): CommentSuggestion[] {
  const tasks = taskIds(plan);
  const milestones = milestoneIds(plan);

  return suggestions.filter((s) => {
    if (s.kind === "update_task") {
      if (!tasks.has(s.taskId)) return false;
      if (s.changes.parentId !== undefined && s.changes.parentId !== null) {
        if (!tasks.has(s.changes.parentId)) return false;
      }
      return true;
    }
    if (s.kind === "create_dependency") {
      const { predecessorId, successorId } = s.dependency;
      return tasks.has(predecessorId) && tasks.has(successorId);
    }
    if (s.kind === "update_milestone") {
      return milestones.has(s.milestoneId);
    }
    return false;
  });
}

/** AI 応答テキストを CommentSuggestionsResponse にパースする */
export function parseCommentSuggestionsResponse(text: string): CommentSuggestion[] {
  const raw = extractJsonFromAiResponse(text);
  const items = extractSuggestionItems(raw);
  const suggestions: CommentSuggestion[] = [];

  for (let i = 0; i < items.length; i++) {
    const normalized = normalizeSuggestionRaw(items[i], i);
    const parsed = CommentSuggestionSchema.safeParse(normalized);
    if (parsed.success) {
      suggestions.push(parsed.data);
    }
  }

  return suggestions;
}

/** パース + 計画に対する ID 検証 */
export function parseAndValidateCommentSuggestions(
  text: string,
  plan: ProjectPlan,
): CommentSuggestion[] {
  const suggestions = parseCommentSuggestionsResponse(text);
  return validateSuggestionsAgainstPlan(suggestions, plan);
}
