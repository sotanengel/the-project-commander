import type { ProjectPlan } from "@tpc/shared";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import DependencyEditor from "./DependencyEditor.js";
import {
  DEPENDENCY_TYPE_OPTIONS,
  NETWORK_VIEWPORT_HEIGHT,
  type NetworkGraphLayout,
  type NetworkNodeLayout,
  computeFitScale,
  layoutNetworkGraph,
  leafTasksInWbsOrder,
  zoomInScale,
  zoomOutScale,
} from "./networkModel.js";
import "./network.css";

function NetworkNode({
  node,
  onOpenTask,
}: {
  node: NetworkNodeLayout;
  onOpenTask: (taskId: string) => void;
}) {
  const open = () => onOpenTask(node.task.id);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  return (
    <g
      className="network-node-clickable"
      transform={`translate(${node.x},${node.y})`}
      tabIndex={0}
      aria-label={`タスク「${node.task.name}」の詳細を開く`}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <rect
        width={node.width}
        height={node.height}
        rx={6}
        className={node.critical ? "network-node critical" : "network-node"}
      />
      <foreignObject x={0} y={0} width={node.width} height={node.height}>
        <div className={`network-node-fo${node.critical ? " critical" : ""}`}>
          <div className="network-node-name">{node.task.name}</div>
          <div className="network-node-sub">{node.sublabel}</div>
        </div>
      </foreignObject>
    </g>
  );
}

function NetworkChart({
  layout,
  onOpenTask,
}: {
  layout: NetworkGraphLayout;
  onOpenTask: (taskId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);

  const recomputeFit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setFitScale(
      computeFitScale(el.clientWidth, NETWORK_VIEWPORT_HEIGHT, layout.width, layout.height),
    );
  }, [layout.width, layout.height]);

  useLayoutEffect(() => {
    recomputeFit();
  }, [recomputeFit]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recomputeFit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [recomputeFit]);

  const scale = fitScale * userZoom;
  const displayWidth = layout.width * scale;
  const displayHeight = layout.height * scale;

  return (
    <div className="network-chart-wrap">
      <div className="network-zoom-toolbar" role="toolbar" aria-label="ネットワーク図の拡大縮小">
        <button type="button" onClick={() => setUserZoom((z) => zoomInScale(z))} aria-label="拡大">
          ＋
        </button>
        <button type="button" onClick={() => setUserZoom((z) => zoomOutScale(z))} aria-label="縮小">
          －
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setUserZoom(1);
            recomputeFit();
          }}
        >
          全体表示
        </button>
        <span className="network-zoom-label muted">{Math.round(scale * 100)}%</span>
      </div>
      <div ref={viewportRef} className="network-viewport">
        <div className="network-scaled" style={{ width: displayWidth, height: displayHeight }}>
          <svg
            width={displayWidth}
            height={displayHeight}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            className="network-chart"
          >
            <title>プロジェクトネットワーク図</title>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
              </marker>
              <marker
                id="arrow-critical"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-critical)" />
              </marker>
            </defs>
            {layout.edges.map((e) => (
              <g key={e.id}>
                <polyline
                  points={e.points}
                  fill="none"
                  className={e.critical ? "network-edge critical" : "network-edge"}
                  markerEnd={e.critical ? "url(#arrow-critical)" : "url(#arrow)"}
                />
                {e.label && (
                  <text
                    x={e.points.split(" ")[1]?.split(",")[0] ?? 0}
                    y={Number(e.points.split(" ")[1]?.split(",")[1] ?? 0) - 6}
                    textAnchor="middle"
                    className={e.critical ? "network-edge-label critical" : "network-edge-label"}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            ))}
            {layout.nodes.map((n) => (
              <NetworkNode key={n.task.id} node={n} onOpenTask={onOpenTask} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
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
    return layoutNetworkGraph(leaves, plan.cpm, plan.dependencies);
  }, [plan, leaves]);

  const openTask = (taskId: string) => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/tasks/${taskId}`);
  };

  return (
    <section className="card">
      <h2>ネットワーク図</h2>
      {error && <p className="error">{error}</p>}
      {!plan && !error && <p className="muted">読み込み中…</p>}
      {plan && plan.tasks.length === 0 && (
        <p className="muted">タスクを登録するとネットワーク図が表示されます。</p>
      )}
      {layout && layout.nodes.length > 0 && <NetworkChart layout={layout} onOpenTask={openTask} />}
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
          <span className="network-legend-item">ボックスをクリックするとタスク詳細を開けます</span>
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
