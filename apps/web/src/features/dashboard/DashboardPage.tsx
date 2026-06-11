import type { Project } from "@tpc/shared";
import { todayLocal } from "@tpc/shared";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import ProjectCard from "./ProjectCard.js";
import "./dashboard.css";

/**
 * プロジェクト一覧 / ダッシュボード。
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(reload, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createProject({
        name,
        startDate,
        description: description || undefined,
      });
      setName("");
      setDescription("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        <h1>⌘ The Project Commander</h1>
        <p className="muted">プロジェクトの計画づくりと進行管理をシンプルに。</p>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="card project-create-form" onSubmit={handleCreate}>
        <div className="row">
          <label className="grow">
            プロジェクト名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新しいプロジェクト名"
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
          <button type="submit">作成</button>
        </div>
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
        {projects.length === 0 ? (
          <p className="muted card empty-hint">
            プロジェクトはまだありません。上のフォームから作成してください。
          </p>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} onDelete={handleDelete} />)
        )}
      </div>
    </main>
  );
}
