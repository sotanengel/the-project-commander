import type { Project } from "@tpc/shared";
import { todayLocal } from "@tpc/shared";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import ProjectCard from "./ProjectCard.js";
import { validateProjectName } from "./projectForm.js";
import { buildSampleProjectBundle } from "./sampleProject.js";
import "./dashboard.css";

/**
 * プロジェクト一覧 / ダッシュボード。
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [startDate, setStartDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const nameError = validateProjectName(name);

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

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (nameError) {
      setNameTouched(true);
      return;
    }
    setError(null);
    try {
      await api.createProject({
        name,
        startDate,
        description: description || undefined,
      });
      setName("");
      setNameTouched(false);
      setDescription("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

  return (
    <main className="container dashboard">
      <div className="dashboard-hero">
        <div>
          <h1>⌘ The Project Commander</h1>
          <p className="muted">プロジェクトの計画づくりと進行管理をシンプルに。</p>
        </div>
        <button type="button" className="secondary" onClick={handleLoadSample} disabled={importing}>
          {importing ? "読み込み中…" : "サンプルプロジェクトを読み込む"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="card project-create-form" onSubmit={handleCreate} noValidate>
        <div className="row">
          <label className="grow">
            プロジェクト名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="新しいプロジェクト名"
              aria-invalid={nameTouched && nameError !== null}
              required
            />
          </label>
          <label>
            開始日
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={nameError !== null}>
            作成
          </button>
        </div>
        {nameTouched && nameError && <p className="error form-field-error">{nameError}</p>}
        <details className="project-create-details">
          <summary>説明を追加（任意）</summary>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="プロジェクトの概要"
            rows={2}
          />
        </details>
      </form>
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
                  上のフォームにプロジェクト名と開始日を入れて「作成」。あとはWBSタブでタスクを追加していくだけ。
                </p>
              </div>
            </div>
          </section>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={handleDelete} />)
        )}
      </div>
    </main>
  );
}
