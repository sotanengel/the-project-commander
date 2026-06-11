import { toDayMs } from "../dates/index.js";
import type { ProjectPlan } from "../types.js";

/** 簡易EVM（schedule-only、日数を価値単位とする出来高分析）の結果 */
export interface EvmResult {
  /** 完成時総予算（=全ワークパッケージの所要日数合計） */
  bac: number;
  /** 計画価値（本日時点で完了している計画上の日数） */
  pv: number;
  /** 出来高（progress による達成済み日数） */
  ev: number;
  /** スケジュール効率指数 EV/PV。PV=0（開始前など）は計測不能で null */
  spi: number | null;
  /** スケジュール差異 EV - PV（負なら遅延） */
  sv: number;
  /** プロジェクト開始日からの経過日数（0〜projectDuration にクランプ） */
  elapsed: number;
  /** SPIに基づく完了予測日数 projectDuration / SPI。SPIがnull/0なら null */
  forecastDuration: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 簡易EVM（schedule-only）を計算する純粋関数。
 *
 * コスト管理を持たないため日数を価値単位とする:
 * - PV: 各ワークパッケージの計画価値 = duration × clamp((elapsed - ES) / duration, 0, 1)
 * - EV: 出来高 = Σ(duration × progress / 100)
 * - BAC: Σduration
 * - SPI: EV / PV（PV=0 なら null = 計測不能）
 * - 完了予測: projectDuration / SPI（SPIがnull/0なら null）
 *
 * elapsed は (today − project.startDate) の日数を 0〜projectDuration にクランプする。
 */
export function computeEvm(plan: ProjectPlan, today: Date | string): EvmResult {
  const startMs = toDayMs(plan.project.startDate, "プロジェクト開始日");
  const todayMs = toDayMs(today, "基準日");
  const { projectDuration, tasks: scheduled } = plan.cpm;

  const rawElapsed = Math.floor((todayMs - startMs) / MS_PER_DAY);
  const elapsed = clamp(rawElapsed, 0, Math.max(0, projectDuration));

  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  let bac = 0;
  let pv = 0;
  let ev = 0;
  for (const s of scheduled) {
    const task = taskById.get(s.taskId);
    if (!task) continue;
    const duration = task.durationDays;
    bac += duration;
    if (duration > 0) {
      pv += duration * clamp((elapsed - s.earlyStart) / duration, 0, 1);
      ev += duration * (task.progress / 100);
    }
  }

  const spi = pv > 0 ? ev / pv : null;
  const forecastDuration = spi !== null && spi > 0 ? projectDuration / spi : null;

  return { bac, pv, ev, spi, sv: ev - pv, elapsed, forecastDuration };
}
