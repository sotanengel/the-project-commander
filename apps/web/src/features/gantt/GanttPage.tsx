import type { Baseline, ProjectPlan } from "@tpc/shared";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import GanttChart from "./GanttChart.js";
import {
  defaultBaselineLabel,
  formatVariance,
  latestBaseline,
  projectDurationVariance,
} from "./baselineModel.js";
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
          <GanttChart plan={plan} baseline={selectedBaseline} />
        </>
      )}
    </section>
  );
}
