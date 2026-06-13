import { z } from "zod";
import { type BulkTaskInput, BulkTaskSchema } from "../types.js";
import { decodePlanDraftPayload, parsePlanDraft } from "./parsePlanDraft.js";

const WbsOnlySchema = z.object({
  tasks: z.array(BulkTaskSchema).min(1, "取り込むタスクがありません"),
});

/**
 * URL クエリの payload をデコードする。
 * フル計画（tasks+dependencies+...）または tasks のみの旧形式に対応。
 */
export function decodeImportPayload(encoded: string): BulkTaskInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeURIComponent(encoded));
  } catch {
    throw new Error("取り込みデータの形式が正しくありません");
  }
  if (typeof raw === "object" && raw !== null && "dependencies" in raw) {
    return parsePlanDraft(raw).tasks;
  }
  const data = WbsOnlySchema.parse(raw);
  return data.tasks;
}

export { decodePlanDraftPayload, parsePlanDraft };
