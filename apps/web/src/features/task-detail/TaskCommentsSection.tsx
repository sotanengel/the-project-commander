import type { TaskComment } from "@tpc/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { formatCommentTimeLabels, validateCommentBody } from "./taskCommentModel.js";

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : "不明なエラーが発生しました";
}

interface TaskCommentsSectionProps {
  taskId: string;
}

export default function TaskCommentsSection({ taskId }: TaskCommentsSectionProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBody, setNewBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadComments = useCallback(() => {
    setLoading(true);
    api
      .listTaskComments(taskId)
      .then((items) => {
        setComments(items);
        setError(null);
      })
      .catch((e: Error) => setError(`コメントの読み込みに失敗しました: ${e.message}`))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleAdd = async () => {
    setError(null);
    const result = validateCommentBody(newBody);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAdding(true);
    try {
      await api.createTaskComment(taskId, { body: result.value });
      setNewBody("");
      loadComments();
    } catch (e) {
      setError(`コメントの追加に失敗しました: ${toMessage(e)}`);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (comment: TaskComment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  const handleSaveEdit = async (commentId: string) => {
    setError(null);
    const result = validateCommentBody(editBody);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavingId(commentId);
    try {
      await api.updateTaskComment(commentId, { body: result.value });
      setEditingId(null);
      setEditBody("");
      loadComments();
    } catch (e) {
      setError(`コメントの更新に失敗しました: ${toMessage(e)}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (comment: TaskComment) => {
    const confirmed = window.confirm("このコメントを削除しますか？");
    if (!confirmed) return;
    setError(null);
    setDeletingId(comment.id);
    try {
      await api.deleteTaskComment(comment.id);
      if (editingId === comment.id) cancelEdit();
      loadComments();
    } catch (e) {
      setError(`コメントの削除に失敗しました: ${toMessage(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="task-comments-section" aria-labelledby="task-comments-heading">
      <header className="task-comments-header">
        <h2 id="task-comments-heading" className="task-comments-title">
          進捗コメント
        </h2>
        <p className="muted task-comments-lead">進捗状況やメモを時系列で記録します。</p>
      </header>

      <div className="task-comments-compose">
        <label htmlFor="task-comment-new">新しいコメント</label>
        <textarea
          id="task-comment-new"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="進捗状況やメモを記録してください"
          rows={3}
        />
        <button
          type="button"
          className="secondary"
          disabled={adding || loading}
          onClick={() => void handleAdd()}
        >
          {adding ? "追加中…" : "コメントを追加"}
        </button>
      </div>

      <div className="task-comments-list-wrap">
        <h3 className="task-comments-list-heading">履歴</h3>
        {loading ? (
          <p className="muted task-comments-empty">読み込み中…</p>
        ) : comments.length === 0 ? (
          <p className="muted task-comments-empty">まだコメントはありません</p>
        ) : (
          <ol className="task-comments-list">
            {comments.map((comment) => {
              const isEditing = editingId === comment.id;
              const timeLabels = formatCommentTimeLabels(comment.createdAt, comment.updatedAt);
              return (
                <li key={comment.id} className="task-comments-item">
                  <div className="task-comments-item-meta">
                    {timeLabels.map((label) => (
                      <time
                        key={label}
                        className="task-comments-time"
                        dateTime={
                          label.startsWith("更新:")
                            ? (comment.updatedAt ?? undefined)
                            : comment.createdAt
                        }
                      >
                        {label}
                      </time>
                    ))}
                  </div>
                  {isEditing ? (
                    <div className="task-comments-edit">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        aria-label="コメントを編集"
                      />
                      <div className="task-comments-item-actions">
                        <button
                          type="button"
                          disabled={savingId === comment.id}
                          onClick={() => void handleSaveEdit(comment.id)}
                        >
                          {savingId === comment.id ? "保存中…" : "保存"}
                        </button>
                        <button type="button" className="secondary" onClick={cancelEdit}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="task-comments-body">{comment.body}</p>
                      <div className="task-comments-item-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEdit(comment)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={deletingId === comment.id}
                          onClick={() => void handleDelete(comment)}
                        >
                          {deletingId === comment.id ? "削除中…" : "削除"}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
