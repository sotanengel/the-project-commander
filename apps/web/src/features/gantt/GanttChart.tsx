import type { Baseline, Milestone, ProjectPlan } from "@tpc/shared";
import {
  baselineChartDayCount,
  baselineTaskMap,
  formatVariance,
  taskFinishVariance,
} from "./baselineModel.js";
import {
  BAR_HEIGHT,
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUMMARY_BAR_HEIGHT,
  addDays,
  barGeometry,
  buildDayCells,
  buildGanttRows,
  buildMonthSegments,
  chartDayCount,
  leafTooltip,
  localToday,
  milestoneX,
  progressFillWidth,
  summaryTooltip,
  todayLineX,
} from "./ganttModel.js";

/** ベースラインバーの高さ（現行バーのすぐ下に細く描く） */
const BASELINE_BAR_HEIGHT = 5;
/** 行末の差異表示用の余白幅 */
const VARIANCE_COL_WIDTH = 56;

interface Props {
  plan: ProjectPlan;
  /** 表示中のスケジュールベースライン（未選択なら null） */
  baseline?: Baseline | null;
}

export default function GanttChart({ plan, baseline = null }: Props) {
  const totalDays = baselineChartDayCount(chartDayCount(plan), baseline);
  const cells = buildDayCells(plan.project.startDate, totalDays);
  const months = buildMonthSegments(cells);
  const rows = buildGanttRows(plan);
  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const todayX = todayLineX(plan.project.startDate, totalDays, localToday());
  const blTasks = baseline ? baselineTaskMap(baseline) : null;
  const svgWidth = chartWidth + 200 + (baseline ? VARIANCE_COL_WIDTH : 0);

  return (
    <div className="gantt-scroll">
      <svg width={svgWidth} height={chartHeight} className="gantt-chart" role="img">
        <title>プロジェクトガントチャート</title>
        <g transform="translate(200,0)">
          {months.map((m) => (
            <text
              key={`${m.label}-${m.startIndex}`}
              x={m.startIndex * DAY_WIDTH + (m.span * DAY_WIDTH) / 2}
              y={16}
              textAnchor="middle"
              className="gantt-month-label"
            >
              {m.label}
            </text>
          ))}
          {cells.map((c) => (
            <g key={c.index} transform={`translate(${c.index * DAY_WIDTH},24)`}>
              <rect
                width={DAY_WIDTH}
                height={HEADER_HEIGHT - 24}
                className={c.isWeekend ? "gantt-weekend" : "gantt-day"}
              />
              <text x={DAY_WIDTH / 2} y={14} textAnchor="middle" className="gantt-day-label">
                {c.dayOfMonth}
              </text>
            </g>
          ))}
          {rows.map((row, i) => {
            const y = HEADER_HEIGHT + i * ROW_HEIGHT;
            const blTask = blTasks?.get(row.task.id);
            return (
              <g key={row.task.id} transform={`translate(0,${y})`}>
                <rect width={chartWidth} height={ROW_HEIGHT} className="gantt-row-bg" />
                {row.kind === "leaf" && row.schedule && (
                  <g>
                    {(() => {
                      const schedule = row.schedule;
                      const g = barGeometry(schedule.earlyStart, schedule.earlyFinish);
                      const barY = (ROW_HEIGHT - BAR_HEIGHT) / 2;
                      const fillWidth = progressFillWidth(
                        schedule.earlyStart,
                        schedule.earlyFinish,
                        row.task.progress,
                      );
                      const blGeometry = blTask
                        ? barGeometry(blTask.earlyStart, blTask.earlyFinish)
                        : null;
                      const variance = blTask
                        ? formatVariance(
                            taskFinishVariance(schedule.earlyFinish, blTask.earlyFinish),
                          )
                        : null;
                      return (
                        <g>
                          <rect
                            x={g.x}
                            y={barY}
                            width={g.width}
                            height={BAR_HEIGHT}
                            className={schedule.isCritical ? "gantt-bar critical" : "gantt-bar"}
                          >
                            <title>{leafTooltip(row.task, schedule, plan.project.startDate)}</title>
                          </rect>
                          {fillWidth > 0 && (
                            <rect
                              x={g.x}
                              y={barY}
                              width={fillWidth}
                              height={BAR_HEIGHT}
                              pointerEvents="none"
                              className={
                                schedule.isCritical
                                  ? "gantt-progress-fill critical"
                                  : "gantt-progress-fill"
                              }
                            />
                          )}
                          {blTask && blGeometry && (
                            <rect
                              x={blGeometry.x}
                              y={barY + BAR_HEIGHT + 1}
                              width={blGeometry.width}
                              height={BASELINE_BAR_HEIGHT}
                              className="gantt-baseline-bar"
                            >
                              <title>
                                {[
                                  `ベースライン: ${row.task.name}`,
                                  `期間: ${addDays(plan.project.startDate, blTask.earlyStart)} 〜 ${addDays(
                                    plan.project.startDate,
                                    Math.max(blTask.earlyFinish - 1, blTask.earlyStart),
                                  )} (${blTask.durationDays}日)`,
                                ].join("\n")}
                              </title>
                            </rect>
                          )}
                          {variance && (
                            <text
                              x={
                                Math.max(schedule.earlyFinish, blTask ? blTask.earlyFinish : 0) *
                                  DAY_WIDTH +
                                8
                              }
                              y={ROW_HEIGHT / 2 + 4}
                              className={`gantt-variance ${variance.tone}`}
                            >
                              {variance.text}
                            </text>
                          )}
                        </g>
                      );
                    })()}
                  </g>
                )}
                {row.kind === "summary" && row.start !== null && row.end !== null && (
                  <rect
                    x={barGeometry(row.start, row.end).x}
                    y={(ROW_HEIGHT - SUMMARY_BAR_HEIGHT) / 2}
                    width={barGeometry(row.start, row.end).width}
                    height={SUMMARY_BAR_HEIGHT}
                    className="gantt-bar summary"
                  >
                    <title>
                      {summaryTooltip(
                        row.task,
                        row.start,
                        row.end,
                        row.progress,
                        plan.project.startDate,
                      )}
                    </title>
                  </rect>
                )}
              </g>
            );
          })}
          {plan.milestones.map((m: Milestone) => (
            <polygon
              key={m.id}
              points={`${milestoneX(plan.project.startDate, m)},${HEADER_HEIGHT - 6} ${milestoneX(plan.project.startDate, m) - 5},${HEADER_HEIGHT + 4} ${milestoneX(plan.project.startDate, m) + 5},${HEADER_HEIGHT + 4}`}
              className="gantt-milestone"
            >
              <title>{m.name}</title>
            </polygon>
          ))}
          {todayX !== null && (
            <line x1={todayX} x2={todayX} y1={0} y2={chartHeight} className="gantt-today-line" />
          )}
        </g>
        {rows.map((row, i) => (
          <text
            key={`label-${row.task.id}`}
            x={8 + row.depth * 12}
            y={HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
            className="gantt-row-label"
          >
            {row.task.name}
          </text>
        ))}
      </svg>
    </div>
  );
}
