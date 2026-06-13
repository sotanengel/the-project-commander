import type { AggregateSummary } from "./aggregateSummary.js";
import { SPI_HELP_TEXT, classifySpi, formatPercent, spiTooltip } from "./summary.js";

interface Props {
  aggregate: AggregateSummary;
}

/** 全プロジェクト横断の集計ダッシュボード */
export default function AggregateDashboard({ aggregate }: Props) {
  const percent = Math.min(100, Math.max(0, aggregate.progressPercent));
  const badge = classifySpi(aggregate.spi);
  const tooltip = spiTooltip(aggregate.spi);

  return (
    <section className="card aggregate-dashboard" aria-label="全プロジェクト集計">
      <h2 className="aggregate-dashboard-title">全体サマリ</h2>
      <div className="aggregate-dashboard-grid">
        <div className="aggregate-stat">
          <span className="muted">プロジェクト</span>
          <strong>{aggregate.projectCount}件</strong>
        </div>
        <div className="aggregate-stat">
          <span className="muted">全体進捗</span>
          <strong>{formatPercent(aggregate.progressPercent)}</strong>
        </div>
        <div className="aggregate-stat">
          <span className="muted">タスク</span>
          <strong>{aggregate.workPackageCount}件</strong>
        </div>
        <div className="aggregate-stat">
          <span className="muted">クリティカル</span>
          <strong className="critical-text">{aggregate.criticalTaskCount}件</strong>
        </div>
      </div>

      {aggregate.workPackageCount > 0 && (
        <>
          <div className="progress-label">
            <span className="muted">進捗バー</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            tabIndex={-1}
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`progress-fill${percent >= 100 ? " done" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {aggregate.projectCount > 0 && (
            <div className="evm-row aggregate-evm-row">
              <span className="muted">
                予定進捗 {formatPercent(aggregate.plannedPercent)} / 実績{" "}
                {formatPercent(aggregate.actualPercent)}
              </span>
              <span className="evm-spi">
                <span className={`badge spi-badge spi-${badge.level}`} title={tooltip}>
                  {badge.label}
                </span>
              </span>
            </div>
          )}

          <div className="aggregate-spi-breakdown">
            <span className="badge spi-badge spi-good">順調 {aggregate.goodCount}</span>
            <span className="badge spi-badge spi-warning">やや遅延 {aggregate.warningCount}</span>
            <span className="badge spi-badge spi-behind">遅延 {aggregate.behindCount}</span>
            {aggregate.unknownCount > 0 && (
              <span className="badge spi-badge spi-unknown">— {aggregate.unknownCount}</span>
            )}
          </div>
          <p className="muted aggregate-spi-note">{SPI_HELP_TEXT}</p>
        </>
      )}
    </section>
  );
}
