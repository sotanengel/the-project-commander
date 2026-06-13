import { computeEvm } from "@tpc/shared";
import type { Project } from "@tpc/shared";
import { todayLocal } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import AggregateDashboard from "./AggregateDashboard.js";
import ProjectCard from "./ProjectCard.js";
import ProjectCreateModal, { type ProjectCreateInput } from "./ProjectCreateModal.js";
import { aggregateProjectMetrics } from "./aggregateSummary.js";
import type { ProjectMetrics } from "./aggregateSummary.js";
import { buildSampleProjectBundle } from "./sampleProject.js";
import { summarizePlan } from "./summary.js";
import "./dashboard.css";

type MetricsMap = Map<string, ProjectMetrics>;

/**
 * プロジェクト一覧 / ダッシュボード。
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [metrics, setMetrics] = useState<MetricsMap>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadMetrics = async (list: Project[]) => {
    const today = new Date(todayLocal());
    const entries = await Promise.all(
      list.map(async (p) => {
        try {
          const plan = await api.getPlan(p.id);
          return [
            p.id,
            {
              summary: summarizePlan(plan.tasks, plan.cpm),
              evm: computeEvm(plan, today),
            },
          ] as const;
        } catch {
          return null;
        }
      }),
    );
    const map: MetricsMap = new Map();
    for (const entry of entries) {
      if (entry) map.set(entry[0], entry[1]);
    }
    setMetrics(map);
  };

  const reload = () => {
    api
      .listProjects()
      .then(async (list) => {
        setProjects(list);
        setLoaded(true);
        if (list.length > 0) {
          await loadMetrics(list);
        } else {
          setMetrics(new Map());
        }
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const handleCreate = async (input: ProjectCreateInput) => {
    setError(null);
    setCreating(true);
    try {
      const project = await api.createProject(input);
      setCreateOpen(false);
      navigate(`/projects/${project.id}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleLoadSample = async () => {
    setError(null);
    setImporting(true);
    try {
      await api.importProject(buildSampleProjectBundle(todayLocal()));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!window.confirm(`プロジェクト「${project.name}」を削除しますか？`)) return;
    setError(null);
    try {
      await api.deleteProject(project.id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openCreateModal = () => {
    setError(null);
    setCreateOpen(true);
  };

  const metricsList = projects
    .map((p) => metrics.get(p.id))
    .filter((m): m is ProjectMetrics => m !== undefined);
  const aggregate = aggregateProjectMetrics(metricsList);

  return (
    <main className="container dashboard">
      <div className="dashboard-toolbar">
        <button type="button" onClick={openCreateModal}>
          + 新規プロジェクト
        </button>
        <button type="button" className="secondary" onClick={handleLoadSample} disabled={importing}>
          {importing ? "読み込み中…" : "サンプルプロジェクトを読み込む"}
        </button>
      </div>
      {error && !createOpen && <p className="error">{error}</p>}
      {loaded && projects.length > 0 && <AggregateDashboard aggregate={aggregate} />}
      <div className="project-grid">
        {loaded && projects.length === 0 ? (
          <section className="card dashboard-empty">
            <p className="icon" aria-hidden="true">
              🚀
            </p>
            <h2>まだプロジェクトがありません</h2>
            <p className="muted">2つの始め方があります。お好きな方をどうぞ。</p>
            <div className="dashboard-empty-choices">
              <div className="dashboard-empty-choice">
                <h3>① サンプルで試す</h3>
                <p className="muted">
                  Webサイト制作のサンプル（タスク・依存関係・リスク入り）を読み込んで、画面の使い方を眺めてみる。
                </p>
                <button type="button" onClick={handleLoadSample} disabled={importing}>
                  {importing ? "読み込み中…" : "サンプルプロジェクトを読み込む"}
                </button>
              </div>
              <div className="dashboard-empty-choice">
                <h3>② 自分で作る</h3>
                <p className="muted">
                  「新規プロジェクト」から名前と概要を入力して作成。AIでタスクを生成するプロンプトが表示されます。
                </p>
                <button type="button" onClick={openCreateModal}>
                  + 新規プロジェクト
                </button>
              </div>
            </div>
          </section>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              metrics={metrics.get(p.id)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
      <ProjectCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitting={creating}
        error={createOpen ? error : null}
      />
    </main>
  );
}
