/**
 * ガントチャートの座標・日付計算（純粋関数）。
 * 描画コンポーネントから分離し、Vitestでテスト可能にする。
 */
import type { Milestone, ProjectPlan, ScheduledTask, Task } from "@tpc/shared";
import {
  type WbsNode,
  addDays,
  buildWbsTree,
  diffDays,
  flattenWbsTree,
  parseDateString,
  toDateString,
  todayLocal,
} from "@tpc/shared";

// ---- レイアウト定数 ----
export const DAY_WIDTH = 28;
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 44;
export const BAR_HEIGHT = 16;
export const SUMMARY_BAR_HEIGHT = 8;

// ---- 日付ユーティリティ（shared へ集約。後方互換の別名を re-export） ----

/** @deprecated parseDateString を使用してください */
export const parseDate = parseDateString;

export { addDays, diffDays, toDateString };

/** @deprecated todayLocal を使用してください */
export const localToday = todayLocal;

/** 土日かどうか */
export function isWeekend(dateStr: string): boolean {
  const dow = parseDateString(dateStr).getUTCDay();
  return dow === 0 || dow === 6;
}

/** 表示用 M/D */
export function formatMonthDay(dateStr: string): string {
  const date = parseDateString(dateStr);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

// ---- ヘッダー（日グリッド・月セグメント） ----

export interface DayCell {
  /** プロジェクト開始日からの経過日数（0始まり） */
  index: number;
  /** YYYY-MM-DD */
  date: string;
  /** 日（1-31） */
  dayOfMonth: number;
  isWeekend: boolean;
}

/** startDate から totalDays 日分の日セルを作る */
export function buildDayCells(startDate: string, totalDays: number): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(startDate, i);
    cells.push({
      index: i,
      date,
      dayOfMonth: parseDate(date).getUTCDate(),
      isWeekend: isWeekend(date),
    });
  }
  return cells;
}

export interface MonthSegment {
  /** 表示ラベル（例: 2026年6月） */
  label: string;
  /** 開始セルのindex */
  startIndex: number;
  /** セル数 */
  span: number;
}

/** 連続する日セルを月ごとにまとめる（ヘッダー上段用） */
export function buildMonthSegments(cells: DayCell[]): MonthSegment[] {
  const segments: MonthSegment[] = [];
  for (const cell of cells) {
    const date = parseDate(cell.date);
    const label = `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
    const last = segments[segments.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      segments.push({ label, startIndex: cell.index, span: 1 });
    }
  }
  return segments;
}

// ---- 行モデル（WBS前順） ----

export interface GanttLeafRow {
  kind: "leaf";
  task: Task;
  depth: number;
  /** CPM結果。CPM対象外（データ不整合時）は null */
  schedule: ScheduledTask | null;
}

export interface GanttSummaryRow {
  kind: "summary";
  task: Task;
  depth: number;
  /** 子孫葉の min(earlyStart)。子孫葉がCPM対象外なら null */
  start: number | null;
  /** 子孫葉の max(earlyFinish) */
  end: number | null;
  /** ロールアップ進捗率 0-100 */
  progress: number;
}

export type GanttRow = GanttLeafRow | GanttSummaryRow;

function collectLeafTaskIds(node: WbsNode): string[] {
  if (node.children.length === 0) return [node.task.id];
  return node.children.flatMap(collectLeafTaskIds);
}

/** plan からガント行（WBS前順、インデント深さ付き）を組み立てる */
export function buildGanttRows(plan: ProjectPlan): GanttRow[] {
  const scheduleById = new Map(plan.cpm.tasks.map((t) => [t.taskId, t]));
  const flat = flattenWbsTree(buildWbsTree(plan.tasks));

  return flat.map((node): GanttRow => {
    if (node.children.length === 0) {
      return {
        kind: "leaf",
        task: node.task,
        depth: node.depth,
        schedule: scheduleById.get(node.task.id) ?? null,
      };
    }
    const schedules = collectLeafTaskIds(node)
      .map((id) => scheduleById.get(id))
      .filter((s): s is ScheduledTask => s !== undefined);
    return {
      kind: "summary",
      task: node.task,
      depth: node.depth,
      start: schedules.length > 0 ? Math.min(...schedules.map((s) => s.earlyStart)) : null,
      end: schedules.length > 0 ? Math.max(...schedules.map((s) => s.earlyFinish)) : null,
      progress: node.rollup.progress,
    };
  });
}

// ---- チャート全体の日数 ----

/** タスク・マイルストーンをすべて含む表示日数（最低7日 + 余白2日） */
export function chartDayCount(plan: ProjectPlan): number {
  const milestoneEnd = plan.milestones.reduce((max, m) => {
    const offset = diffDays(plan.project.startDate, m.dueDate);
    return Math.max(max, offset + 1);
  }, 0);
  return Math.max(plan.cpm.projectDuration, milestoneEnd, 7) + 2;
}

// ---- バー座標 ----

export interface BarGeometry {
  x: number;
  width: number;
}

/** 経過日数の区間 [start, end) をX座標とピクセル幅に変換する（最小幅3px） */
export function barGeometry(start: number, end: number, dayWidth: number = DAY_WIDTH): BarGeometry {
  return {
    x: start * dayWidth,
    width: Math.max((end - start) * dayWidth, 3),
  };
}

/** 葉タスクバー内の進捗塗り幅（progress% は0-100にクランプ） */
export function progressFillWidth(
  start: number,
  end: number,
  progress: number,
  dayWidth: number = DAY_WIDTH,
): number {
  const total = barGeometry(start, end, dayWidth).width;
  const ratio = Math.min(Math.max(progress, 0), 100) / 100;
  return total * ratio;
}

/** マイルストーン◆のX座標（該当日セルの中央） */
export function milestoneX(
  startDate: string,
  milestone: Milestone,
  dayWidth: number = DAY_WIDTH,
): number {
  return (diffDays(startDate, milestone.dueDate) + 0.5) * dayWidth;
}

/**
 * 今日線のX座標。今日がチャート範囲外なら null。
 * todayStr は省略時に現地時間の今日を使う。
 */
export function todayLineX(
  startDate: string,
  totalDays: number,
  todayStr: string,
  dayWidth: number = DAY_WIDTH,
): number | null {
  const offset = diffDays(startDate, todayStr);
  if (offset < 0 || offset >= totalDays) return null;
  return (offset + 0.5) * dayWidth;
}

// ---- ツールチップ文言 ----

/** 葉タスクのツールチップ（日付・期間・フロート） */
export function leafTooltip(task: Task, schedule: ScheduledTask, startDate: string): string {
  const start = addDays(startDate, schedule.earlyStart);
  // earlyFinish は排他的終端なので、最終日は前日
  const lastDay = addDays(startDate, Math.max(schedule.earlyFinish - 1, schedule.earlyStart));
  const lines = [
    task.name,
    `期間: ${start} 〜 ${lastDay} (${task.durationDays}日)`,
    `進捗: ${Math.round(task.progress)}%`,
    `トータルフロート: ${schedule.totalFloat}日`,
  ];
  if (schedule.isCritical) lines.push("クリティカルパス上のタスク");
  return lines.join("\n");
}

/** サマリタスクのツールチップ */
export function summaryTooltip(
  task: Task,
  start: number,
  end: number,
  progress: number,
  startDate: string,
): string {
  const startStr = addDays(startDate, start);
  const lastDay = addDays(startDate, Math.max(end - 1, start));
  return [
    `${task.name} (サマリ)`,
    `期間: ${startStr} 〜 ${lastDay} (${end - start}日)`,
    `進捗: ${Math.round(progress)}%`,
  ].join("\n");
}
