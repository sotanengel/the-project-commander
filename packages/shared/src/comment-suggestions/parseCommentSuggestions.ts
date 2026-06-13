import type { ProjectPlan } from "../types.js";
import { extractJsonFromAiResponse } from "./extractJson.js";
import { extractSuggestionItems, normalizeSuggestionRaw } from "./normalizeCommentSuggestions.js";
import { resolveSuggestionIdsInRaw } from "./resolveSuggestionIds.js";
import { type CommentSuggestion, CommentSuggestionSchema } from "./schemas.js";

export { CommentSuggestionParseError } from "./extractJson.js";

export interface CommentSuggestionsParseMeta {
  rawItemCount: number;
  parsedCount: number;
  validatedCount: number;
  filteredCount: number;
}

export interface CommentSuggestionsParseResult {
  suggestions: CommentSuggestion[];
  meta: CommentSuggestionsParseMeta;
}

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

function parseItemsFromText(text: string, plan?: ProjectPlan): CommentSuggestionsParseResult {
  const raw = extractJsonFromAiResponse(text);
  const items = extractSuggestionItems(raw);
  const parsed: CommentSuggestion[] = [];

  for (let i = 0; i < items.length; i++) {
    let normalized = normalizeSuggestionRaw(items[i], i);
    if (plan) {
      normalized = resolveSuggestionIdsInRaw(normalized, plan);
    }
    const result = CommentSuggestionSchema.safeParse(normalized);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  return {
    suggestions: parsed,
    meta: {
      rawItemCount: items.length,
      parsedCount: parsed.length,
      validatedCount: parsed.length,
      filteredCount: items.length - parsed.length,
    },
  };
}

/** AI 応答テキストを CommentSuggestionsResponse にパースする */
export function parseCommentSuggestionsResponse(text: string): CommentSuggestion[] {
  return parseItemsFromText(text).suggestions;
}

/** パース + 計画に対する ID 検証（メタ情報付き） */
export function parseAndValidateCommentSuggestions(
  text: string,
  plan: ProjectPlan,
): CommentSuggestionsParseResult {
  const { suggestions: parsed, meta } = parseItemsFromText(text, plan);
  const validated = validateSuggestionsAgainstPlan(parsed, plan);
  const planFiltered = parsed.length - validated.length;

  return {
    suggestions: validated,
    meta: {
      rawItemCount: meta.rawItemCount,
      parsedCount: meta.parsedCount,
      validatedCount: validated.length,
      filteredCount: meta.filteredCount + planFiltered,
    },
  };
}
