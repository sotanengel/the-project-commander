import { BulkTaskSchema, type DependencyCreateInput } from "@tpc/shared";
import { z } from "zod";
import type { BulkTaskInput } from "../../api/client.js";
import type { PromptPurpose } from "./prompts.js";

// ---- スキーマ ----

const WbsImportSchema = z.object({
  tasks: z.array(BulkTaskSchema),
});

const RiskImportItemSchema = z.object({
  title: z.string().min(1),
  probability: z.enum(["low", "medium", "high"]).optional(),
  impact: z.enum(["low", "medium", "high"]).optional(),
  response: z.string().optional(),
});
export type RiskImportItem = z.infer<typeof RiskImportItemSchema>;

const RiskImportSchema = z.object({
  risks: z.array(RiskImportItemSchema),
});

const DependencyImportItemSchema = z.object({
  predecessorName: z.string().min(1),
  successorName: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]).optional(),
  lagDays: z.number().optional(),
});
export type DependencyImportItem = z.infer<typeof DependencyImportItemSchema>;

const DependencyImportSchema = z.object({
  dependencies: z.array(DependencyImportItemSchema),
});

// ---- JSON抽出 ----

/**
 * start位置の「{」に対応する「}」のインデックスを返す（文字列リテラル考慮）。
 * 対応する「}」が無い場合は -1。
 */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 「{」から対応する「}」までをブラケットカウントで探し、
 * 最初にJSONとして解析できたオブジェクトを返す。見つからなければ null。
 */
function scanForJsonObject(text: string): { value: unknown } | { parseError: string } | null {
  let start = text.indexOf("{");
  let lastParseError: string | null = null;
  while (start !== -1) {
    const end = findMatchingBrace(text, start);
    if (end !== -1) {
      const candidate = text.slice(start, end + 1);
      try {
        return { value: JSON.parse(candidate) as unknown };
      } catch (e) {
        lastParseError = e instanceof Error ? e.message : String(e);
      }
    }
    start = text.indexOf("{", start + 1);
  }
  return lastParseError !== null ? { parseError: lastParseError } : null;
}

/**
 * AI応答テキストからJSONオブジェクトを抽出してパースする。
 * 1. ```json / ``` フェンスがあればその中身を優先して抽出する
 *    （前置きの説明文に別のJSON断片があっても惑わされない）。
 * 2. フェンスが無い・フェンス内が解析できない場合は、テキスト全体から
 *    「{」と対応する「}」をブラケットカウント（文字列リテラル考慮）で探し、
 *    最初に解析できたJSONを返す。
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("入力が空です。AIの応答を貼り付けてください。");
  }
  // フェンス内のJSONを優先する
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fencePattern)) {
    const inner = match[1];
    if (!inner) continue;
    const result = scanForJsonObject(inner);
    if (result && "value" in result) return result.value;
  }
  if (!trimmed.includes("{")) {
    throw new Error(
      "JSONオブジェクトが見つかりません。「{」で始まるJSONを含むテキストを貼り付けてください。",
    );
  }
  const result = scanForJsonObject(trimmed);
  if (result === null) {
    throw new Error("JSONが途中で終わっています。「}」が不足していないか確認してください。");
  }
  if ("parseError" in result) {
    throw new Error(`JSONの解析に失敗しました: ${result.parseError}`);
  }
  return result.value;
}

// ---- 目的別パース ----

export type ParsedImport =
  | { kind: "tasks"; tasks: BulkTaskInput[] }
  | { kind: "risks"; risks: RiskImportItem[] }
  | { kind: "dependencies"; dependencies: DependencyImportItem[] };

function formatZodError(error: z.ZodError): string {
  const details = error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(ルート)";
      return `${path}: ${issue.message}`;
    })
    .join(" / ");
  return `JSONの形式が正しくありません: ${details}`;
}

/** AI応答テキストを抽出・検証し、目的に応じた取り込みデータに変換する */
export function parseAiResponse(text: string, purpose: PromptPurpose): ParsedImport {
  const raw = extractJson(text);
  try {
    if (purpose === "wbs_draft" || purpose === "task_breakdown") {
      const data = WbsImportSchema.parse(raw);
      return { kind: "tasks", tasks: data.tasks };
    }
    if (purpose === "risk_identify") {
      const data = RiskImportSchema.parse(raw);
      return { kind: "risks", risks: data.risks };
    }
    const data = DependencyImportSchema.parse(raw);
    return { kind: "dependencies", dependencies: data.dependencies };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(formatZodError(e));
    }
    throw e;
  }
}

// ---- プレビュー構築 ----

export interface TaskPreviewRow {
  name: string;
  depth: number;
  durationDays: number | undefined;
}

/** 階層タスクをインデント表示用に深さ付きでフラット化する */
export function flattenTasks(tasks: BulkTaskInput[], depth = 0): TaskPreviewRow[] {
  const rows: TaskPreviewRow[] = [];
  for (const task of tasks) {
    rows.push({ name: task.name, depth, durationDays: task.durationDays });
    if (task.children && task.children.length > 0) {
      rows.push(...flattenTasks(task.children, depth + 1));
    }
  }
  return rows;
}

/** 子孫を含めたタスク総数 */
export function countTasks(tasks: BulkTaskInput[]): number {
  return flattenTasks(tasks).length;
}

// ---- 依存の名前解決 ----

export interface ResolvedDependency {
  label: string;
  input: DependencyCreateInput;
}

export interface ImportFailure {
  label: string;
  reason: string;
}

export interface DependencyResolution {
  resolved: ResolvedDependency[];
  failures: ImportFailure[];
}

/**
 * 依存関係のタスク名をタスクIDに解決する。
 * 見つからない名前・同名タスクが複数あって特定できない名前がある依存は
 * 理由付きで failures に入れ、残りの解決は続行する。
 */
export function resolveDependencies(
  dependencies: DependencyImportItem[],
  tasks: { id: string; name: string }[],
): DependencyResolution {
  // 同名タスクが複数ある場合は null を入れて「曖昧」を表す
  const byName = new Map<string, string | null>();
  for (const task of tasks) {
    byName.set(task.name, byName.has(task.name) ? null : task.id);
  }
  const resolved: ResolvedDependency[] = [];
  const failures: ImportFailure[] = [];
  for (const dep of dependencies) {
    const label = `${dep.predecessorName} → ${dep.successorName}`;
    const names = [dep.predecessorName, dep.successorName];
    const missing = names.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      failures.push({ label, reason: `タスク名が見つかりません: ${missing.join("、")}` });
      continue;
    }
    const ambiguous = names.filter((name) => byName.get(name) === null);
    if (ambiguous.length > 0) {
      failures.push({
        label,
        reason: `同名のタスクが複数あるため特定できません: ${ambiguous.join("、")}`,
      });
      continue;
    }
    const predecessorId = byName.get(dep.predecessorName) as string;
    const successorId = byName.get(dep.successorName) as string;
    resolved.push({
      label,
      input: { predecessorId, successorId, type: dep.type, lagDays: dep.lagDays },
    });
  }
  return { resolved, failures };
}

// ---- 1件ずつの取り込み ----

export interface ImportSummary {
  succeeded: number;
  failed: number;
  failures: ImportFailure[];
}

/**
 * 項目を1件ずつ実行し、失敗（409循環など）はスキップして続行する。
 * 事前失敗（名前解決エラーなど）は initialFailures で渡すと集計に含まれる。
 */
export async function importOneByOne<T>(
  items: T[],
  labelOf: (item: T) => string,
  run: (item: T) => Promise<unknown>,
  initialFailures: ImportFailure[] = [],
): Promise<ImportSummary> {
  const failures: ImportFailure[] = [...initialFailures];
  let succeeded = 0;
  for (const item of items) {
    try {
      await run(item);
      succeeded++;
    } catch (e) {
      failures.push({
        label: labelOf(item),
        reason: e instanceof Error ? e.message : "不明なエラー",
      });
    }
  }
  return { succeeded, failed: failures.length, failures };
}

// ---- エクスポートファイル名 ----

/** プロジェクト名からダウンロード用のファイル名を作る */
export function buildExportFileName(projectName: string): string {
  const sanitized = projectName.trim().replace(/[\\/:*?"<>|]/g, "_");
  return `${sanitized || "project"}.json`;
}
