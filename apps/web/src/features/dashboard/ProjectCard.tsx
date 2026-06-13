import type { EvmResult, Project } from "@tpc/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectMetrics } from "./aggregateSummary.js";
import {
  type ProjectSummary,
  SPI_HELP_TEXT,
  classifySpi,
  formatPercent,
  spiTooltip,
} from "./summary.js";

interface Props {
  project: Project;
  metrics?: ProjectMetrics;
  onDelete: (project: Project) => void;
}

/** プロジェクト1件のサマリカード。クリックでプロジェクト画面へ遷移する。 */
export default function ProjectCard({ project, metrics, onDelete }: Props) {
  return (
    <article className="card project-card">
      <Link
        to={`/projects/${project.id}`}
        className="project-card-link"
        aria-label={`プロジェクト「${project.name}」を開く`}
      >
        <div className="project-card-head">
          <div>
            <h2 className="project-card-title">
              <span>{project.name}</span>
            </h2>
            <span className="project-card-date">開始日 {project.startDate}</span>
          </div>
        </div>

        {!metrics && <p className="muted project-card-note">読み込み中…</p>}
        {metrics && <SummaryBody summary={metrics.summary} evm={metrics.evm} />}
      </Link>
      <button
        type="button"
        className="project-card-delete"
        aria-label={`プロジェクト「${project.name}」を削除`}
        onClick={() => onDelete(project)}
      >
        削除
      </button>
    </article>
  );
}

function SummaryBody({ summary, evm }: { summary: ProjectSummary; evm: EvmResult }) {
  if (summary.workPackageCount === 0) {
    return (
      <p className="muted project-card-note">
        タスク未登録です。カードを開いてWBSからタスクを追加しましょう。
      </p>
    );
  }
  const percent = Math.min(100, Math.max(0, summary.progressPercent));
  return (
    <>
      <div>
        <div className="progress-label">
          <span className="muted">全体進捗</span>
          <strong>{formatPercent(summary.progressPercent)}</strong>
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
      </div>
      <EvmRow evm={evm} />
      <div className="project-card-stats">
        <span className="badge">タスク {summary.workPackageCount}件</span>
        <span className="badge">期間 {summary.projectDuration}日</span>
        <span className="badge critical">クリティカル {summary.criticalTaskCount}件</span>
      </div>
    </>
  );
}

/** 簡易EVM行: 予定進捗(PV/BAC)・実績(EV/BAC)とSPIバッジ。BAC=0なら非表示。 */
function EvmRow({ evm }: { evm: EvmResult }) {
  const [showHelp, setShowHelp] = useState(false);
  if (evm.bac <= 0) return null;
  const plannedPercent = (evm.pv / evm.bac) * 100;
  const actualPercent = (evm.ev / evm.bac) * 100;
  const badge = classifySpi(evm.spi);
  const tooltip = spiTooltip(evm.spi);
  return (
    <>
      <div className="evm-row">
        <span className="muted">
          予定進捗 {formatPercent(plannedPercent)} / 実績 {formatPercent(actualPercent)}
        </span>
        <span className="evm-spi">
          <span className={`badge spi-badge spi-${badge.level}`} title={tooltip}>
            {badge.label}
          </span>
          <button
            type="button"
            className="spi-help-button"
            title={tooltip}
            aria-label="SPIバッジの意味を表示"
            aria-expanded={showHelp}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowHelp((v) => !v);
            }}
          >
            ？
          </button>
        </span>
      </div>
      {showHelp && <p className="muted spi-help-note">{SPI_HELP_TEXT}</p>}
    </>
  );
}
