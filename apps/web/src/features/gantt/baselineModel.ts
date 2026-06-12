/**
 * スケジュールベースライン（PMBOK: 承認版スケジュール）関連の純粋関数。
 * 差異計算・表示文言・チャート寸法の補正を描画から分離する。
 */
import type { Baseline, BaselineTask } from "@tpc/shared";

/** 差異の表示情報。tone は色分け用（late=赤 / early=緑 / zero=中立） */
export interface VarianceDisplay {
  text: string;
  tone: "late" | "early" | "zero";
}

/** タスクの終了差異（現EF − ベースラインEF。正=遅延、負=前倒し） */
export function taskFinishVariance(
  currentEarlyFinish: number,
  baselineEarlyFinish: number,
): number {
  return currentEarlyFinish - baselineEarlyFinish;
}

/** 差異日数を「+2日」「-1日」「±0」に整形する */
export function formatVariance(days: number): VarianceDisplay {
  if (days > 0) return { text: `+${days}日`, tone: "late" };
  if (days < 0) return { text: `${days}日`, tone: "early" };
  return { text: "±0", tone: "zero" };
}

/** プロジェクト全体の期間差異（現所要日数 − ベースライン所要日数） */
export function projectDurationVariance(currentDuration: number, baseline: Baseline): number {
  return currentDuration - baseline.projectDuration;
}

/** taskId → BaselineTask のマップ（オーバーレイ描画の対応付け用） */
export function baselineTaskMap(baseline: Baseline): Map<string, BaselineTask> {
  return new Map(baseline.tasks.map((t) => [t.taskId, t]));
}

/** createdAt が最新のベースラインを返す。空なら null */
export function latestBaseline(baselines: Baseline[]): Baseline | null {
  let latest: Baseline | null = null;
  for (const b of baselines) {
    if (latest === null || b.createdAt > latest.createdAt) latest = b;
  }
  return latest;
}

/** 保存時のデフォルトラベル「ベースライン MM/DD」（現地時間・ゼロ埋め） */
export function defaultBaselineLabel(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `ベースライン ${m}/${d}`;
}

/**
 * ベースラインを重ねたときのチャート表示日数。
 * ベースラインのEFが現計画より長い場合は余白2日込みで広げる。
 */
export function baselineChartDayCount(currentDayCount: number, baseline: Baseline | null): number {
  if (!baseline) return currentDayCount;
  const maxFinish = baseline.tasks.reduce((max, t) => Math.max(max, t.earlyFinish), 0);
  return Math.max(currentDayCount, maxFinish + 2);
}

/** ベースラインの目的説明（初学者向けの平易な日本語）。1要素=1段落 */
export function baselinePurposeLines(): string[] {
  return [
    "ベースラインとは、計画を承認した時点のスケジュールのスナップショット（控え）です。",
    "保存しておくと、その後の計画変更や遅れを「当初計画との差」として測れるようになります。",
    "計画が固まったタイミングで「現在の計画をベースラインとして保存」を押しましょう。",
  ];
}

/** 差異バッジ凡例の1項目（sample はバッジの表示例、description は読み方） */
export interface VarianceLegendItem {
  tone: VarianceDisplay["tone"];
  sample: string;
  description: string;
}

/** 差異バッジ（±n日）の読み方の凡例。表示例は formatVariance と同じ整形を使う */
export function varianceLegendItems(): VarianceLegendItem[] {
  return [
    { tone: "late", sample: formatVariance(2).text, description: "計画より遅延（赤）" },
    { tone: "early", sample: formatVariance(-1).text, description: "計画より前倒し（緑）" },
    { tone: "zero", sample: formatVariance(0).text, description: "計画どおり" },
  ];
}

/** チャート凡例の1項目（key はスウォッチの見た目を決めるCSS用キー） */
export interface ChartLegendItem {
  key: "baseline" | "current" | "progress" | "today";
  label: string;
}

/** チャート要素の凡例。ベースライン未表示・今日線が範囲外のときは該当項目を省く */
export function chartLegendItems(visible: {
  hasBaseline: boolean;
  hasTodayLine: boolean;
}): ChartLegendItem[] {
  const items: ChartLegendItem[] = [
    { key: "current", label: "色付きバー = 現在の計画" },
    { key: "progress", label: "濃い塗り = 進捗" },
  ];
  if (visible.hasTodayLine) {
    items.push({ key: "today", label: "縦線 = 今日" });
  }
  if (visible.hasBaseline) {
    items.unshift({ key: "baseline", label: "灰色バー = ベースライン（当初計画）" });
  }
  return items;
}
