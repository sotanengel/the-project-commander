import type { ProjectPlan } from "@tpc/shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";

const NODE_W = 120;
const NODE_H = 48;
const X_SCALE = 80;
const Y_GAP = 72;

export default function NetworkPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .getPlan(projectId)
      .then(setPlan)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  const layout = useMemo(() => {
    if (!plan) return null;
    const schedule = new Map(plan.cpm.tasks.map((t) => [t.taskId, t]));
    const leaves = plan.tasks.filter((t) => !plan.tasks.some((c) => c.parentId === t.id));
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
        return { from, to, type: d.type, critical };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    const width = Math.max(...nodes.map((n) => n.x + NODE_W), 400);
    const height = Math.max(...nodes.map((n) => n.y + NODE_H), 200);
    return { nodes, edges, width, height };
  }, [plan]);

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
            {layout.edges.map((e) => (
              <line
                key={`${e.from.task.id}-${e.to.task.id}`}
                x1={e.from.x + NODE_W}
                y1={e.from.y + NODE_H / 2}
                x2={e.to.x}
                y2={e.to.y + NODE_H / 2}
                className={e.critical ? "network-edge critical" : "network-edge"}
                markerEnd="url(#arrow)"
              />
            ))}
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
    </section>
  );
}
