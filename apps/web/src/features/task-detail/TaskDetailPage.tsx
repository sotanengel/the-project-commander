import type { TaskUpdateInput } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { validateTaskEdit } from "../wbs/wbsViewModel.js";
import {
  type TaskDetailView,
  buildCreateModeBreadcrumb,
  buildTaskBreadcrumb,
  buildTaskCreateInput,
  buildTaskDeleteConfirmMessage,
  buildTaskDetailView,
  formatAssignee,
  isTaskCreateMode,
} from "./taskDetailModel.js";
import "./taskDetail.css";

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : "不明なエラーが発生しました";
}

interface CreateModeContext {
  parentId: string;
  breadcrumb: string[];
}

export default function TaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const [searchParams] = useSearchParams();
  const parentIdParam = searchParams.get("parentId");
  const navigate = useNavigate();
  const isCreateMode = isTaskCreateMode(taskId);

  const [view, setView] = useState<TaskDetailView | null>(null);
  const [createContext, setCreateContext] = useState<CreateModeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [duration, setDuration] = useState("");
  const [progress, setProgress] = useState("");

  const reload = () => {
    if (!projectId || !taskId || isCreateMode) return;
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

    if (isCreateMode) {
      if (!parentIdParam) {
        setError("親タスクが指定されていません");
        setCreateContext(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      api
        .getPlan(projectId)
        .then((plan) => {
          const parent = plan.tasks.find((t) => t.id === parentIdParam);
          if (!parent) {
            setError("親タスクが見つかりません");
            setCreateContext(null);
            return;
          }
          setCreateContext({
            parentId: parentIdParam,
            breadcrumb: buildCreateModeBreadcrumb(buildTaskBreadcrumb(plan.tasks, parentIdParam)),
          });
          setName("");
          setDescription("");
          setAssignee("");
          setDuration("1");
          setProgress("0");
          setView(null);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
      return;
    }

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
        setCreateContext(null);
        setName(detail.task.name);
        setDescription(detail.task.description);
        setAssignee(detail.task.assignee);
        setDuration(String(detail.task.durationDays));
        setProgress(String(detail.task.progress));
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, taskId, isCreateMode, parentIdParam]);

  const handleSave = async () => {
    if (!projectId) return;
    setSaveError(null);

    if (isCreateMode) {
      if (!createContext) return;
      const result = buildTaskCreateInput(
        { name, duration, progress, description, assignee },
        createContext.parentId,
      );
      if (!result.ok) {
        setSaveError(result.errors.join(" / "));
        return;
      }
      setSaving(true);
      try {
        const created = await api.createTask(projectId, result.value);
        navigate(`/projects/${projectId}/tasks/${created.id}`);
      } catch (e) {
        setSaveError(`保存に失敗しました: ${toMessage(e)}`);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!taskId || !view) return;

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

  const handleAddChild = () => {
    if (!projectId || !view) return;
    navigate(`/projects/${projectId}/tasks/new?parentId=${view.task.id}`);
  };

  const handleCancelCreate = () => {
    if (!projectId || !createContext) return;
    navigate(`/projects/${projectId}/tasks/${createContext.parentId}`);
  };

  const handleDelete = async () => {
    if (!projectId || !taskId || !view || isCreateMode) return;
    const confirmed = window.confirm(
      buildTaskDeleteConfirmMessage(view.task.name, view.children.length),
    );
    if (!confirmed) return;

    setDeleting(true);
    setSaveError(null);
    try {
      await api.deleteTask(taskId);
      navigate(`/projects/${projectId}`);
    } catch (e) {
      setSaveError(`削除に失敗しました: ${toMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="muted">読み込み中…</p>;
  }

  if (error || (!isCreateMode && !view) || (isCreateMode && !createContext)) {
    return (
      <section className="card">
        <p className="error">{error ?? "タスクが見つかりません"}</p>
        <Link to={`/projects/${projectId}`}>← WBSへ戻る</Link>
      </section>
    );
  }

  const breadcrumb = isCreateMode ? (createContext?.breadcrumb ?? []) : (view?.breadcrumb ?? []);
  const title = isCreateMode ? name.trim() || "新しい子タスク" : (view?.task.name ?? "");
  const isLeaf = isCreateMode ? true : (view?.isLeaf ?? true);

  return (
    <section className="card task-detail">
      <header className="task-detail-header">
        <p className="task-detail-breadcrumb muted">
          <Link to={`/projects/${projectId}`}>WBS</Link>
          {" / "}
          {breadcrumb.join(" / ")}
        </p>
        <h1 className="task-detail-title">
          {title}
          {isCreateMode && <span className="badge task-detail-draft-badge">下書き</span>}
        </h1>
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
          <input
            id="task-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCreateMode ? "新しい子タスク" : undefined}
            required
          />
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
              {isLeaf ? (
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
                `${view?.task.durationDays}日（子タスクから自動集計）`
              )}
            </dd>
          </div>
          <div>
            <dt>進捗</dt>
            <dd>
              {isLeaf ? (
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
                `${Math.round(view?.task.progress ?? 0)}%（子タスクから自動集計）`
              )}
            </dd>
          </div>
          {!isCreateMode && view?.schedule && (
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

        {!isCreateMode && view && (
          <>
            <div className="task-detail-children">
              <div className="task-detail-children-head">
                <h3>子タスク</h3>
                <button type="button" className="secondary" onClick={handleAddChild}>
                  + 子タスクを追加
                </button>
              </div>
              {view.children.length === 0 ? (
                <p className="muted task-detail-empty-deps">子タスクはありません</p>
              ) : (
                <ul>
                  {view.children.map((t) => (
                    <li key={t.id}>
                      <Link to={`/projects/${projectId}/tasks/${t.id}`}>{t.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
          </>
        )}

        {isCreateMode && (
          <p className="muted task-detail-create-hint">
            保存するまでタスクは作成されません。キャンセルすると入力内容は破棄されます。
          </p>
        )}

        {saveError && <p className="error">{saveError}</p>}

        <div className="task-detail-actions">
          <button type="submit" disabled={saving || deleting}>
            {saving ? "保存中…" : "保存"}
          </button>
          {isCreateMode ? (
            <button
              type="button"
              className="secondary"
              onClick={handleCancelCreate}
              disabled={saving}
            >
              キャンセル
            </button>
          ) : (
            <Link to={`/projects/${projectId}`}>WBSへ戻る</Link>
          )}
          {!isCreateMode && (
            <button
              type="button"
              className="danger"
              disabled={saving || deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? "削除中…" : "削除"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
