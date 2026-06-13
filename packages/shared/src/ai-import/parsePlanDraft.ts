import { z } from "zod";
import {
  type BulkTaskInput,
  BulkTaskSchema,
  DateStringSchema,
  LevelSchema,
  type MilestoneCreateInput,
  type RiskCreateInput,
  type StakeholderCreateInput,
} from "../types.js";
import type { DependencyImportItem } from "./resolveDependencies.js";

const DependencyImportItemSchema = z.object({
  predecessorName: z.string().min(1),
  successorName: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]).optional(),
  lagDays: z.number().optional(),
});

const MilestoneImportItemSchema = z.object({
  name: z.string().min(1),
  dueDate: DateStringSchema,
  status: z.enum(["pending", "done"]).optional(),
});

const RiskImportItemSchema = z.object({
  title: z.string().min(1),
  probability: LevelSchema.optional(),
  impact: LevelSchema.optional(),
  response: z.string().min(1, "対応方針は必須です"),
});

const StakeholderImportItemSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  influence: LevelSchema.optional(),
  interest: LevelSchema.optional(),
  note: z.string().optional(),
});

export const PlanDraftSchema = z.object({
  tasks: z.array(BulkTaskSchema).min(1, "取り込むタスクがありません"),
  dependencies: z.array(DependencyImportItemSchema).default([]),
  milestones: z.array(MilestoneImportItemSchema).default([]),
  risks: z.array(RiskImportItemSchema).default([]),
  stakeholders: z.array(StakeholderImportItemSchema).default([]),
});

export type PlanDraftInput = z.infer<typeof PlanDraftSchema>;
export type PlanDraftMilestone = z.infer<typeof MilestoneImportItemSchema>;
export type PlanDraftRisk = z.infer<typeof RiskImportItemSchema>;
export type PlanDraftStakeholder = z.infer<typeof StakeholderImportItemSchema>;

/** フル計画JSONオブジェクトを検証する */
export function parsePlanDraft(raw: unknown): PlanDraftInput {
  return PlanDraftSchema.parse(raw);
}

/** URL payload 用: エンコード済み文字列をパース */
export function decodePlanDraftPayload(encoded: string): PlanDraftInput {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeURIComponent(encoded));
  } catch {
    throw new Error("取り込みデータの形式が正しくありません");
  }
  return parsePlanDraft(raw);
}

/** フル計画を URL ペイロードにエンコード */
export function encodePlanDraftPayload(draft: PlanDraftInput): string {
  return encodeURIComponent(JSON.stringify(draft));
}

export type {
  DependencyImportItem,
  MilestoneCreateInput,
  RiskCreateInput,
  StakeholderCreateInput,
  BulkTaskInput,
};
