import { computeEvm } from "@tpc/shared";
import type { EvmResult, Project } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { type ProjectSummary, classifySpi, formatPercent, summarizePlan } from "./summary.js";

type SummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: ProjectSummary; evm: EvmResult };

interface Props {
  project: Project;
  onDelete: (project: Project) => void;
}

/** プロジェクト1件のサマリカード。クリックでプロジェクト画面へ遷移する。 */
export default function ProjectCard({ project, onDelete }: Props) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .getPlan(project.id)
      .then((plan) => {
        if (cancelled) return;
        setState({
          status: "ready",
          summary: summarizePlan(plan.tasks, plan.cpm),
          evm: computeEvm(plan, new Date()),
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setState({ status: "error", message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  return (
    <article className="card project-card">
      <div className="project-card-head">
        <div>
          <h2 className="project-card-title">
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
          </h2>
          <span className="project-card-date">開始日 {project.startDate}</span>
        </div>
        <button
          type="button"
          className="project-card-delete"
          aria-label={`プロジェクト「${project.name}」を削除`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
        >
          削除
        </button>
      </div>

      {state.status === "loading" && <p className="muted project-card-note">読み込み中…</p>}
      {state.status === "error" && <p className="error project-card-note">{state.message}</p>}
      {state.status === "ready" && <SummaryBody summary={state.summary} evm={state.evm} />}
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
  if (evm.bac <= 0) return null;
  const plannedPercent = (evm.pv / evm.bac) * 100;
  const actualPercent = (evm.ev / evm.bac) * 100;
  const badge = classifySpi(evm.spi);
  return (
    <div className="evm-row">
      <span className="muted">
        予定進捗 {formatPercent(plannedPercent)} / 実績 {formatPercent(actualPercent)}
      </span>
      <span className={`badge spi-badge spi-${badge.level}`} title={spiTitle(evm.spi)}>
        {badge.label}
      </span>
    </div>
  );
}

function spiTitle(spi: number | null): string {
  return spi === null ? "SPI 計測不能（計画価値が0）" : `SPI ${spi.toFixed(2)}`;
}
