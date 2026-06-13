import type { Project } from "@tpc/shared";
import { todayLocal } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import ProjectCard from "./ProjectCard.js";
import ProjectCreateModal, { type ProjectCreateInput } from "./ProjectCreateModal.js";
import { buildSampleProjectBundle } from "./sampleProject.js";
import "./dashboard.css";

/**
 * プロジェクト一覧 / ダッシュボード。
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = () => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list);
        setLoaded(true);
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

  return (
    <main className="container dashboard">
      <div className="dashboard-hero">
        <div>
          <h1>⌘ The Project Commander</h1>
          <p className="muted">プロジェクトの計画づくりと進行管理をシンプルに。</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" onClick={openCreateModal}>
            + 新規プロジェクト
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleLoadSample}
            disabled={importing}
          >
            {importing ? "読み込み中…" : "サンプルプロジェクトを読み込む"}
          </button>
        </div>
      </div>
      {error && !createOpen && <p className="error">{error}</p>}
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
          projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={handleDelete} />)
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
