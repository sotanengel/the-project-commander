import type { Baseline, ProjectPlan } from "@tpc/shared";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import GanttChart from "./GanttChart.js";
import {
  baselineChartDayCount,
  baselinePurposeLines,
  chartLegendItems,
  defaultBaselineLabel,
  formatVariance,
  latestBaseline,
  projectDurationVariance,
  varianceLegendItems,
} from "./baselineModel.js";
import { chartDayCount, localToday, todayLineX } from "./ganttModel.js";
import "./gantt.css";

export default function GanttPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [planData, baselineData] = await Promise.all([
        api.getPlan(projectId),
        api.listBaselines(projectId),
      ]);
      setPlan(planData);
      setBaselines(baselineData);
      setSelectedBaselineId((prev) => {
        // 選択中のものが残っていれば維持、無ければ最新を選ぶ
        if (prev && baselineData.some((b) => b.id === prev)) return prev;
        return latestBaseline(baselineData)?.id ?? null;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveBaseline = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const created = await api.createBaseline(projectId, {
        label: labelInput.trim() || defaultBaselineLabel(),
      });
      setLabelInput("");
      await load();
      setSelectedBaselineId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBaseline = async () => {
    if (!selectedBaselineId) return;
    const target = baselines.find((b) => b.id === selectedBaselineId);
    if (!window.confirm(`ベースライン「${target?.label ?? ""}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await api.deleteBaseline(selectedBaselineId);
      setSelectedBaselineId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedBaseline = baselines.find((b) => b.id === selectedBaselineId) ?? null;
  // チャートと同じ条件で今日線が描画範囲に入るかを判定し、凡例の表示を揃える
  const hasTodayLine = plan
    ? todayLineX(
        plan.project.startDate,
        baselineChartDayCount(chartDayCount(plan), selectedBaseline),
        localToday(),
      ) !== null
    : false;
  const durationVariance =
    plan && selectedBaseline
      ? formatVariance(projectDurationVariance(plan.cpm.projectDuration, selectedBaseline))
      : null;

  return (
    <section className="card">
      <div className="gantt-header">
        <h2>ガントチャート</h2>
        {durationVariance && (
          <span className="gantt-duration-variance">
            プロジェクト期間差異:{" "}
            <strong className={`gantt-variance-badge ${durationVariance.tone}`}>
              {durationVariance.text}
            </strong>
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {!plan && !error && <p className="muted">読み込み中…</p>}
      {plan && plan.tasks.length === 0 && (
        <p className="muted">タスクを登録するとガントチャートが表示されます。</p>
      )}
      {plan && plan.tasks.length > 0 && (
        <>
          <div className="gantt-baseline-toolbar">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder={defaultBaselineLabel()}
              aria-label="ベースラインのラベル"
              disabled={busy}
            />
            <button type="button" onClick={handleSaveBaseline} disabled={busy}>
              現在の計画をベースラインとして保存
            </button>
            {baselines.length > 0 && (
              <>
                <select
                  value={selectedBaselineId ?? ""}
                  onChange={(e) => setSelectedBaselineId(e.target.value || null)}
                  aria-label="表示するベースライン"
                  disabled={busy}
                >
                  <option value="">（表示しない）</option>
                  {baselines.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label || b.createdAt.slice(0, 10)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="danger"
                  onClick={handleDeleteBaseline}
                  disabled={busy || !selectedBaselineId}
                >
                  削除
                </button>
              </>
            )}
          </div>
          {baselines.length === 0 && (
            <p className="muted gantt-baseline-hint">
              ベースラインを保存すると計画とのズレを追跡できます。
            </p>
          )}
          <details className="gantt-help">
            <summary>ベースラインと差異バッジの見方</summary>
            <div className="gantt-help-body">
              {baselinePurposeLines().map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="gantt-help-subtitle">差異バッジ（±n日）の読み方</p>
              <ul className="gantt-variance-legend">
                {varianceLegendItems().map((item) => (
                  <li key={item.tone}>
                    <span className={`gantt-variance-badge ${item.tone}`}>{item.sample}</span>{" "}
                    {item.description}
                  </li>
                ))}
              </ul>
              <p className="gantt-help-note">
                プロジェクト期間差異は全体の所要日数、各タスク行末の ±n日 は終了日の差です。
              </p>
            </div>
          </details>
          <div className="gantt-chart-legend" aria-label="チャートの凡例">
            {chartLegendItems({ hasBaseline: selectedBaseline !== null, hasTodayLine }).map(
              (item) => (
                <span key={item.key} className="gantt-legend-item">
                  <span className={`gantt-legend-swatch ${item.key}`} aria-hidden="true" />
                  {item.label}
                </span>
              ),
            )}
          </div>
          <GanttChart plan={plan} baseline={selectedBaseline} />
        </>
      )}
    </section>
  );
}
