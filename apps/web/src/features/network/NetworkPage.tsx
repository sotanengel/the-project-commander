import type { ProjectPlan } from "@tpc/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import DependencyEditor from "./DependencyEditor.js";
import { DEPENDENCY_TYPE_OPTIONS, edgeLabel, leafTasksInWbsOrder } from "./networkModel.js";
import "./network.css";

const NODE_W = 120;
const NODE_H = 48;
const X_SCALE = 80;
const Y_GAP = 72;

export default function NetworkPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!projectId) return;
    api
      .getPlan(projectId)
      .then((p) => {
        setPlan(p);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const leaves = useMemo(() => (plan ? leafTasksInWbsOrder(plan.tasks) : []), [plan]);

  const layout = useMemo(() => {
    if (!plan || leaves.length === 0) return null;
    const schedule = new Map(plan.cpm.tasks.map((t) => [t.taskId, t]));
    const nodes = leaves.map((task, i) => {
      const s = schedule.get(task.id);
      return {
        task,
        x: (s?.earlyStart ?? 0) * X_SCALE + 40,
        y: 40 + i * Y_GAP,
        critical: s?.isCritical ?? false,
        float: s?.totalFloat ?? 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.task.id, n]));
    const edges = plan.dependencies
      .map((d) => {
        const from = byId.get(d.predecessorId);
        const to = byId.get(d.successorId);
        if (!from || !to) return null;
        const critical = from.critical && to.critical;
        return { id: d.id, from, to, critical, label: edgeLabel(d.type, d.lagDays) };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const width = Math.max(...nodes.map((n) => n.x + NODE_W), 400);
    const height = Math.max(...nodes.map((n) => n.y + NODE_H), 200);
    return { nodes, edges, width, height };
  }, [plan, leaves]);

  return (
    <section className="card">
      <h2>ネットワーク図</h2>
      {error && <p className="error">{error}</p>}
      {!plan && !error && <p className="muted">読み込み中…</p>}
      {plan && plan.tasks.length === 0 && (
        <p className="muted">タスクを登録するとネットワーク図が表示されます。</p>
      )}
      {layout && layout.nodes.length > 0 && (
        <div className="network-scroll">
          <svg width={layout.width} height={layout.height} role="img" className="network-chart">
            <title>プロジェクトネットワーク図</title>
            {layout.edges.map((e) => {
              const x1 = e.from.x + NODE_W;
              const y1 = e.from.y + NODE_H / 2;
              const x2 = e.to.x;
              const y2 = e.to.y + NODE_H / 2;
              return (
                <g key={e.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={e.critical ? "network-edge critical" : "network-edge"}
                    markerEnd="url(#arrow)"
                  />
                  {e.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 6}
                      textAnchor="middle"
                      className={e.critical ? "network-edge-label critical" : "network-edge-label"}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
              </marker>
            </defs>
            {layout.nodes.map((n) => (
              <g key={n.task.id} transform={`translate(${n.x},${n.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  className={n.critical ? "network-node critical" : "network-node"}
                />
                <text x={NODE_W / 2} y={20} textAnchor="middle" className="network-label">
                  {n.task.name}
                </text>
                <text x={NODE_W / 2} y={36} textAnchor="middle" className="network-sub">
                  {n.task.durationDays}日 / TF {n.float}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
      {plan && leaves.length > 0 && (
        <div className="network-legend">
          <span className="network-legend-item">
            <span className="network-legend-swatch critical" />
            クリティカルパス（遅延がプロジェクト全体に影響）
          </span>
          <span className="network-legend-item">
            <span className="network-legend-swatch normal" />
            通常タスク
          </span>
          <span className="network-legend-item">TF=トータルフロート（遅らせられる余裕日数）</span>
          {DEPENDENCY_TYPE_OPTIONS.map((opt) => (
            <span key={opt.value} className="network-legend-item">
              <span className="network-legend-type">{opt.value}</span>
              {opt.description}
            </span>
          ))}
        </div>
      )}
      {plan && projectId && plan.tasks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {leaves.length >= 2 ? (
            <DependencyEditor
              projectId={projectId}
              plan={plan}
              leaves={leaves}
              onChanged={reload}
            />
          ) : (
            <p className="muted">
              依存関係を設定するには、ワークパッケージ（子を持たないタスク）が2件以上必要です。WBSページでタスクを追加してください。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
