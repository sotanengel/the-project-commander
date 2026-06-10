import type { ProjectPlan } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import GanttChart from "./GanttChart.js";

export default function GanttPage() {
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

  return (
    <section className="card">
      <h2>ガントチャート</h2>
      {error && <p className="error">{error}</p>}
      {!plan && !error && <p className="muted">読み込み中…</p>}
      {plan && plan.tasks.length === 0 && (
        <p className="muted">タスクを登録するとガントチャートが表示されます。</p>
      )}
      {plan && plan.tasks.length > 0 && <GanttChart plan={plan} />}
    </section>
  );
}
