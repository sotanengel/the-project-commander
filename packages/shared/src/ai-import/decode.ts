import { z } from "zod";
import { type BulkTaskInput, BulkTaskSchema } from "../types.js";

const WbsImportSchema = z.object({
  tasks: z.array(BulkTaskSchema).min(1, "取り込むタスクがありません"),
});

/**
 * URL クエリの payload をデコードしてタスク配列に変換する。
 */
export function decodeImportPayload(encoded: string): BulkTaskInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeURIComponent(encoded));
  } catch {
    throw new Error("取り込みデータの形式が正しくありません");
  }
  const data = WbsImportSchema.parse(raw);
  return data.tasks;
}
