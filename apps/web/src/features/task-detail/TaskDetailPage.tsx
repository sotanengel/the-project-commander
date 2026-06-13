import type { TaskUpdateInput } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { validateTaskEdit } from "../wbs/wbsViewModel.js";
import { type TaskDetailView, buildTaskDetailView, formatAssignee } from "./taskDetailModel.js";
import "./taskDetail.css";

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : "不明なエラーが発生しました";
}

export default function TaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const [view, setView] = useState<TaskDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [duration, setDuration] = useState("");
  const [progress, setProgress] = useState("");

  const reload = () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    api
      .getPlan(projectId)
      .then((plan) => {
        const detail = buildTaskDetailView(plan, taskId);
        if (!detail) {
          setError("タスクが見つかりません");
          setView(null);
          return;
        }
        setView(detail);
        setName(detail.task.name);
        setDescription(detail.task.description);
        setAssignee(detail.task.assignee);
        setDuration(String(detail.task.durationDays));
        setProgress(String(detail.task.progress));
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!projectId || !taskId) return;
    setLoading(true);
    api
      .getPlan(projectId)
      .then((plan) => {
        const detail = buildTaskDetailView(plan, taskId);
        if (!detail) {
          setError("タスクが見つかりません");
          setView(null);
          return;
        }
        setView(detail);
        setName(detail.task.name);
        setDescription(detail.task.description);
        setAssignee(detail.task.assignee);
        setDuration(String(detail.task.durationDays));
        setProgress(String(detail.task.progress));
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, taskId]);

  const handleSave = async () => {
    if (!taskId || !view) return;
    setSaveError(null);

    const result = validateTaskEdit({
      name,
      duration,
      ...(view.isLeaf ? { progress } : {}),
    });
    if (!result.ok) {
      setSaveError(Object.values(result.errors).filter(Boolean).join(" / "));
      return;
    }

    const input: TaskUpdateInput = {
      name: result.value.name,
      description: description.trim(),
      assignee: assignee.trim(),
      durationDays: result.value.durationDays,
      ...(result.value.progress !== undefined ? { progress: result.value.progress } : {}),
    };

    setSaving(true);
    try {
      await api.updateTask(taskId, input);
      reload();
    } catch (e) {
      setSaveError(`保存に失敗しました: ${toMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">読み込み中…</p>;
  }

  if (error || !view) {
    return (
      <section className="card">
        <p className="error">{error ?? "タスクが見つかりません"}</p>
        <Link to={`/projects/${projectId}`}>← WBSへ戻る</Link>
      </section>
    );
  }

  return (
    <section className="card task-detail">
      <header className="task-detail-header">
        <p className="task-detail-breadcrumb muted">
          <Link to={`/projects/${projectId}`}>WBS</Link>
          {" / "}
          {view.breadcrumb.join(" / ")}
        </p>
        <h1 className="task-detail-title">{view.task.name}</h1>
      </header>

      <form
        className="task-detail-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div className="task-detail-field">
          <label htmlFor="task-name">タスク名</label>
          <input id="task-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="task-detail-field">
          <label htmlFor="task-description">作業内容</label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="このタスクで行う作業内容を記述してください"
          />
        </div>

        <div className="task-detail-field">
          <label htmlFor="task-assignee">担当</label>
          <input
            id="task-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="未設定の場合は空欄のまま"
          />
          <span className="muted" style={{ fontSize: 12 }}>
            現在: {formatAssignee(assignee)}
          </span>
        </div>

        <dl className="task-detail-meta">
          <div>
            <dt>所要日数</dt>
            <dd>
              {view.isLeaf ? (
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: 80 }}
                  aria-label="所要日数"
                />
              ) : (
                `${view.task.durationDays}日（子タスクから自動集計）`
              )}
            </dd>
          </div>
          <div>
            <dt>進捗</dt>
            <dd>
              {view.isLeaf ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  style={{ width: 80 }}
                  aria-label="進捗"
                />
              ) : (
                `${Math.round(view.task.progress)}%（子タスクから自動集計）`
              )}
            </dd>
          </div>
          {view.schedule && (
            <>
              <div>
                <dt>開始日</dt>
                <dd>{view.startDateLabel}</dd>
              </div>
              <div>
                <dt>終了日</dt>
                <dd>{view.finishDateLabel}</dd>
              </div>
              <div>
                <dt>総フロート</dt>
                <dd>{view.schedule.totalFloat}日</dd>
              </div>
              <div>
                <dt>クリティカル</dt>
                <dd className={view.schedule.isCritical ? "task-detail-critical" : undefined}>
                  {view.schedule.isCritical ? "はい" : "いいえ"}
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="task-detail-deps">
          <div>
            <h3>先行タスク</h3>
            {view.predecessors.length === 0 ? (
              <p className="muted task-detail-empty-deps">なし</p>
            ) : (
              <ul>
                {view.predecessors.map((t) => (
                  <li key={t.id}>
                    <Link to={`/projects/${projectId}/tasks/${t.id}`}>{t.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>後続タスク</h3>
            {view.successors.length === 0 ? (
              <p className="muted task-detail-empty-deps">なし</p>
            ) : (
              <ul>
                {view.successors.map((t) => (
                  <li key={t.id}>
                    <Link to={`/projects/${projectId}/tasks/${t.id}`}>{t.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {saveError && <p className="error">{saveError}</p>}

        <div className="task-detail-actions">
          <button type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <Link to={`/projects/${projectId}`}>WBSへ戻る</Link>
        </div>
      </form>
    </section>
  );
}
