import {
  BulkTaskSchema,
  DateStringSchema,
  type DependencyCreateInput,
  type ImportFailure,
  LevelSchema,
  resolveDependenciesByName,
} from "@tpc/shared";
import { z } from "zod";
import type { BulkTaskInput } from "../../api/client.js";
import type { PromptPurpose } from "./prompts.js";

export { resolveDependenciesByName as resolveDependencies };
export type {
  DependencyResolution,
  ImportFailure,
  ResolvedDependency,
} from "@tpc/shared";

// ---- エラー ----

/** 取り込み失敗の種類（UI側で平易な日本語に変換するための区分） */
export type AiImportErrorKind =
  | "empty"
  | "no_json"
  | "truncated"
  | "parse_failed"
  | "schema_mismatch";

/**
 * AI応答の解析・検証エラー。
 * kind と不足項目（missing）を持ち、表示用メッセージへの変換は
 * aiAssistModel.ts の formatImportError() が担う。
 */
export class AiImportError extends Error {
  readonly kind: AiImportErrorKind;
  /** スキーマ不一致時に特定できた不足項目のパス（例: "tasks.0.name"） */
  readonly missing: string[];
  /** スキーマ不一致時の詳細（型違いなど不足以外の内容） */
  readonly details: string | undefined;

  constructor(
    kind: AiImportErrorKind,
    message: string,
    options: { missing?: string[]; details?: string } = {},
  ) {
    super(message);
    this.name = "AiImportError";
    this.kind = kind;
    this.missing = options.missing ?? [];
    this.details = options.details;
  }
}

// ---- スキーマ ----

const WbsImportSchema = z.object({
  tasks: z.array(BulkTaskSchema),
});

const RiskImportItemSchema = z.object({
  title: z.string().min(1),
  probability: LevelSchema.optional(),
  impact: LevelSchema.optional(),
  response: z.string().min(1, "対応方針は必須です"),
});
export type RiskImportItem = z.infer<typeof RiskImportItemSchema>;

const RiskImportSchema = z.object({
  risks: z.array(RiskImportItemSchema),
});

const MilestoneImportItemSchema = z.object({
  name: z.string().min(1),
  dueDate: DateStringSchema,
  status: z.enum(["pending", "done"]).optional(),
});
export type MilestoneImportItem = z.infer<typeof MilestoneImportItemSchema>;

const MilestoneImportSchema = z.object({
  milestones: z.array(MilestoneImportItemSchema),
});

const StakeholderImportItemSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  influence: LevelSchema.optional(),
  interest: LevelSchema.optional(),
  note: z.string().optional(),
});
export type StakeholderImportItem = z.infer<typeof StakeholderImportItemSchema>;

const StakeholderImportSchema = z.object({
  stakeholders: z.array(StakeholderImportItemSchema),
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
    throw new AiImportError("empty", "入力が空です。AIの応答を貼り付けてください。");
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
    throw new AiImportError(
      "no_json",
      "JSONオブジェクトが見つかりません。「{」で始まるJSONを含むテキストを貼り付けてください。",
    );
  }
  const result = scanForJsonObject(trimmed);
  if (result === null) {
    throw new AiImportError(
      "truncated",
      "JSONが途中で終わっています。「}」が不足していないか確認してください。",
    );
  }
  if ("parseError" in result) {
    throw new AiImportError("parse_failed", `JSONの解析に失敗しました: ${result.parseError}`);
  }
  return result.value;
}

// ---- 目的別パース ----

export type ParsedImport =
  | { kind: "tasks"; tasks: BulkTaskInput[] }
  | { kind: "risks"; risks: RiskImportItem[] }
  | { kind: "dependencies"; dependencies: DependencyImportItem[] }
  | { kind: "milestones"; milestones: MilestoneImportItem[] }
  | { kind: "stakeholders"; stakeholders: StakeholderImportItem[] };

function pathOf(issue: z.ZodIssue): string {
  return issue.path.length > 0 ? issue.path.join(".") : "(ルート)";
}

/** ZodErrorを kind=schema_mismatch のAiImportError（不足項目・詳細付き）に変換する */
function toSchemaMismatchError(error: z.ZodError): AiImportError {
  // 「値がundefined」= 必須項目の不足として特定する（zod v3 の invalid_type）
  const missing = error.issues
    .filter((issue) => issue.code === "invalid_type" && issue.received === "undefined")
    .map(pathOf);
  const details = error.issues
    .slice(0, 5)
    .map((issue) => `${pathOf(issue)}: ${issue.message}`)
    .join(" / ");
  return new AiImportError("schema_mismatch", `JSONの形式が正しくありません: ${details}`, {
    missing: [...new Set(missing)],
    details,
  });
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
    if (purpose === "milestones") {
      const data = MilestoneImportSchema.parse(raw);
      return { kind: "milestones", milestones: data.milestones };
    }
    if (purpose === "stakeholders") {
      const data = StakeholderImportSchema.parse(raw);
      return { kind: "stakeholders", stakeholders: data.stakeholders };
    }
    const data = DependencyImportSchema.parse(raw);
    return { kind: "dependencies", dependencies: data.dependencies };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw toSchemaMismatchError(e);
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
