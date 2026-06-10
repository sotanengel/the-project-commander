import type { Project } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, Route, Routes, useParams } from "react-router-dom";
import { api } from "./api/client.js";
import AiAssistPage from "./features/ai-assist/AiAssistPage.js";
import DashboardPage from "./features/dashboard/DashboardPage.js";
import GanttPage from "./features/gantt/GanttPage.js";
import NetworkPage from "./features/network/NetworkPage.js";
import RegistersPage from "./features/registers/RegistersPage.js";
import WbsPage from "./features/wbs/WbsPage.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/projects/:projectId" element={<ProjectLayout />}>
        <Route index element={<WbsPage />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="gantt" element={<GanttPage />} />
        <Route path="registers" element={<RegistersPage />} />
        <Route path="ai" element={<AiAssistPage />} />
      </Route>
    </Routes>
  );
}

function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .getProject(projectId)
      .then(setProject)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  if (error) {
    return (
      <main className="container">
        <p className="error">{error}</p>
        <Link to="/">← プロジェクト一覧へ戻る</Link>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand">
          ⌘ The Project Commander
        </Link>
        <span className="project-name">{project?.name ?? "読み込み中…"}</span>
        <nav className="tabs">
          <NavLink to="" end>
            WBS
          </NavLink>
          <NavLink to="network">ネットワーク図</NavLink>
          <NavLink to="gantt">ガント</NavLink>
          <NavLink to="registers">リスク / 関係者</NavLink>
          <NavLink to="ai">AIアシスト</NavLink>
        </nav>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
