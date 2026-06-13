import { z } from "zod";
import { DateStringSchema, DependencyCreateSchema, TaskUpdateSchema } from "../types.js";

const SuggestionBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rationale: z.string().min(1),
});

export const UpdateTaskSuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal("update_task"),
  taskId: z.string().min(1),
  changes: TaskUpdateSchema.refine((c) => Object.keys(c).length > 0, {
    message: "changes には少なくとも1つのフィールドが必要です",
  }),
});
export type UpdateTaskSuggestion = z.infer<typeof UpdateTaskSuggestionSchema>;

export const CreateDependencySuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal("create_dependency"),
  dependency: DependencyCreateSchema,
});
export type CreateDependencySuggestion = z.infer<typeof CreateDependencySuggestionSchema>;

export const UpdateMilestoneSuggestionSchema = SuggestionBaseSchema.extend({
  kind: z.literal("update_milestone"),
  milestoneId: z.string().min(1),
  changes: z
    .object({
      name: z.string().min(1).optional(),
      dueDate: DateStringSchema.optional(),
      status: z.enum(["pending", "done"]).optional(),
    })
    .refine((c) => Object.keys(c).length > 0, {
      message: "changes には少なくとも1つのフィールドが必要です",
    }),
});
export type UpdateMilestoneSuggestion = z.infer<typeof UpdateMilestoneSuggestionSchema>;

export const CommentSuggestionSchema = z.discriminatedUnion("kind", [
  UpdateTaskSuggestionSchema,
  CreateDependencySuggestionSchema,
  UpdateMilestoneSuggestionSchema,
]);
export type CommentSuggestion = z.infer<typeof CommentSuggestionSchema>;

export const CommentSuggestionsResponseSchema = z.object({
  suggestions: z.array(CommentSuggestionSchema).default([]),
});
export type CommentSuggestionsResponse = z.infer<typeof CommentSuggestionsResponseSchema>;

export const CommentSuggestionAnalyzeInputSchema = z.object({
  projectId: z.string().min(1),
  commentBody: z.string().trim().min(1),
});
export type CommentSuggestionAnalyzeInput = z.infer<typeof CommentSuggestionAnalyzeInputSchema>;
