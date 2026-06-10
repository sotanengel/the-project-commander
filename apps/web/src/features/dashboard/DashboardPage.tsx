import type { Project } from "@tpc/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";

/**
 * プロジェクト一覧 / ダッシュボード。
 * 暫定版（基盤スタブ）: 進捗サマリ等の本実装はユニット6で置き換える。
 */
export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
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
        startDate: new Date().toISOString().slice(0, 10),
      });
      setName("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="container">
      <h1>⌘ The Project Commander</h1>
      <p className="muted">プロジェクトの計画づくりと進行管理をシンプルに。</p>
      {error && <p className="error">{error}</p>}
      <form className="card row" onSubmit={handleCreate}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しいプロジェクト名"
          required
        />
        <button type="submit">作成</button>
      </form>
      <div className="card">
        {projects.length === 0 ? (
          <p className="muted">プロジェクトはまだありません。上のフォームから作成してください。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>プロジェクト</th>
                <th>開始日</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.startDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
