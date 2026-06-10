import type { Milestone, ProjectPlan } from "@tpc/shared";
import {
  BAR_HEIGHT,
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SUMMARY_BAR_HEIGHT,
  barGeometry,
  buildDayCells,
  buildGanttRows,
  buildMonthSegments,
  chartDayCount,
  leafTooltip,
  localToday,
  milestoneX,
  summaryTooltip,
  todayLineX,
} from "./ganttModel.js";

interface Props {
  plan: ProjectPlan;
}

export default function GanttChart({ plan }: Props) {
  const totalDays = chartDayCount(plan);
  const cells = buildDayCells(plan.project.startDate, totalDays);
  const months = buildMonthSegments(cells);
  const rows = buildGanttRows(plan);
  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const todayX = todayLineX(plan.project.startDate, totalDays, localToday());

  return (
    <div className="gantt-scroll">
      <svg width={chartWidth + 200} height={chartHeight} className="gantt-chart" role="img">
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
            return (
              <g key={row.task.id} transform={`translate(0,${y})`}>
                <rect width={chartWidth} height={ROW_HEIGHT} className="gantt-row-bg" />
                {row.kind === "leaf" && row.schedule && (
                  <g>
                    {(() => {
                      const g = barGeometry(row.schedule.earlyStart, row.schedule.earlyFinish);
                      return (
                        <rect
                          x={g.x}
                          y={(ROW_HEIGHT - BAR_HEIGHT) / 2}
                          width={g.width}
                          height={BAR_HEIGHT}
                          className={row.schedule.isCritical ? "gantt-bar critical" : "gantt-bar"}
                        >
                          <title>
                            {leafTooltip(row.task, row.schedule, plan.project.startDate)}
                          </title>
                        </rect>
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
