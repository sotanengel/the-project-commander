import { type WbsNode, buildWbsTree, countDescendants, insertSiblingPlan } from "@tpc/shared";
import type { Task } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import "./wbs.css";
import {
  type TaskUpdatePlan,
  adaptSiblingInsertPlan,
  indentTaskPlans,
  moveTaskPlans,
  outdentTaskPlans,
} from "./wbsAdapter.js";
import {
  type TaskEditErrors,
  WBS_SHORTCUTS,
  resolveWbsKeyAction,
  validateTaskEdit,
} from "./wbsViewModel.js";

async function applyUpdates(updates: TaskUpdatePlan[]) {
  for (const u of updates) {
    await api.updateTask(u.id, u.input);
  }
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : "不明なエラーが発生しました";
}

function WbsRow({
  node,
  depth,
  onReload,
  tasks,
  projectId,
}: {
  node: WbsNode;
  depth: number;
  onReload: () => void;
  tasks: Task[];
  projectId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.task.name);
  const [duration, setDuration] = useState(String(node.task.durationDays));
  const [progress, setProgress] = useState(String(node.task.progress));
  const [errors, setErrors] = useState<TaskEditErrors>({});
  const [rowError, setRowError] = useState<string | null>(null);

  // 子を持たないタスク＝ワークパッケージ。進捗はワークパッケージにのみ入力する
  const isWorkPackage = node.children.length === 0;

  const startEdit = () => {
    setName(node.task.name);
    setDuration(String(node.task.durationDays));
    setProgress(String(node.task.progress));
    setErrors({});
    setRowError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setErrors({});
    setEditing(false);
  };

  const save = async () => {
    const result = validateTaskEdit({
      name,
      duration,
      ...(isWorkPackage ? { progress } : {}),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await api.updateTask(node.task.id, {
        name: result.value.name,
        durationDays: result.value.durationDays,
        ...(result.value.progress !== undefined ? { progress: result.value.progress } : {}),
      });
      setRowError(null);
      setEditing(false);
      onReload();
    } catch (e) {
      setRowError(`保存に失敗しました: ${toMessage(e)}。内容を確認して再度お試しください。`);
    }
  };

  const run = async (fn: () => TaskUpdatePlan[] | null) => {
    const updates = fn();
    if (!updates || updates.length === 0) return;
    try {
      await applyUpdates(updates);
      setRowError(null);
      onReload();
    } catch (e) {
      setRowError(`行の操作に失敗しました: ${toMessage(e)}。画面を再読み込みしてください。`);
    }
  };

  const addSibling = async () => {
    const plan = adaptSiblingInsertPlan(insertSiblingPlan(tasks, node.task.id));
    if (!plan) return;
    try {
      await applyUpdates(plan.bumps);
      await api.createTask(node.task.projectId, {
        name: "新しいタスク",
        parentId: plan.parentId,
        sortOrder: plan.sortOrder,
      });
      setRowError(null);
      onReload();
    } catch (e) {
      setRowError(`タスクの追加に失敗しました: ${toMessage(e)}。再度お試しください。`);
    }
  };

  const addChild = async () => {
    try {
      await api.createTask(node.task.projectId, {
        name: "新しい子タスク",
        parentId: node.task.id,
      });
      setRowError(null);
      onReload();
    } catch (e) {
      setRowError(`タスクの追加に失敗しました: ${toMessage(e)}。再度お試しください。`);
    }
  };

  const remove = async () => {
    const n = countDescendants(tasks, node.task.id);
    const msg =
      n > 0
        ? `「${node.task.name}」と子タスク${n}件を削除しますか？`
        : `「${node.task.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteTask(node.task.id);
      setRowError(null);
      onReload();
    } catch (e) {
      setRowError(`削除に失敗しました: ${toMessage(e)}。再度お試しください。`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const action = resolveWbsKeyAction({ key: e.key, altKey: e.altKey, editing });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "save":
        void save();
        break;
      case "cancel":
        cancelEdit();
        break;
      case "moveUp":
        void run(() => moveTaskPlans(tasks, node.task.id, "up"));
        break;
      case "moveDown":
        void run(() => moveTaskPlans(tasks, node.task.id, "down"));
        break;
      case "indent":
        void run(() => indentTaskPlans(tasks, node.task.id));
        break;
      case "outdent":
        void run(() => outdentTaskPlans(tasks, node.task.id));
        break;
    }
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useFocusableInteractive: tabIndex でフォーカス可能にしている */}
      <tr className="wbs-row" tabIndex={0} onKeyDown={onKeyDown}>
        <td style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {editing ? (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-label="タスク名"
              />
              {errors.name && <div className="wbs-field-error">{errors.name}</div>}
            </>
          ) : (
            <button type="button" className="linkish" onClick={startEdit}>
              {node.task.name}
              {isWorkPackage && <span className="badge wbs-wp-badge">WP</span>}
            </button>
          )}
        </td>
        <td>
          {editing ? (
            <>
              <input
                type="number"
                min={0}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                style={{ width: 64 }}
                aria-invalid={errors.duration ? true : undefined}
                aria-label="所要日数"
              />
              {errors.duration && <div className="wbs-field-error">{errors.duration}</div>}
            </>
          ) : (
            node.rollup.durationDays
          )}
        </td>
        <td>
          {editing && isWorkPackage ? (
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              style={{ width: 64 }}
              aria-label="進捗（%）"
            />
          ) : (
            `${Math.round(node.rollup.progress)}%`
          )}
        </td>
        <td className="wbs-actions">
          {editing ? (
            <>
              <button type="button" onClick={save}>
                保存
              </button>
              <button type="button" className="muted-btn" onClick={cancelEdit}>
                取消
              </button>
            </>
          ) : (
            <>
              <Link
                to={`/projects/${projectId}/tasks/${node.task.id}`}
                className="wbs-detail-link"
                title="タスク詳細"
              >
                詳細
              </Link>
              <button
                type="button"
                title="上へ (Alt+↑)"
                onClick={() => run(() => moveTaskPlans(tasks, node.task.id, "up"))}
              >
                ↑
              </button>
              <button
                type="button"
                title="下へ (Alt+↓)"
                onClick={() => run(() => moveTaskPlans(tasks, node.task.id, "down"))}
              >
                ↓
              </button>
              <button
                type="button"
                title="インデント (Alt+→)"
                onClick={() => run(() => indentTaskPlans(tasks, node.task.id))}
              >
                →
              </button>
              <button
                type="button"
                title="アウトデント (Alt+←)"
                onClick={() => run(() => outdentTaskPlans(tasks, node.task.id))}
              >
                ←
              </button>
              <button type="button" onClick={addSibling}>
                +兄弟
              </button>
              <button type="button" onClick={addChild}>
                +子
              </button>
              <button type="button" className="danger-btn" onClick={remove}>
                削除
              </button>
            </>
          )}
        </td>
      </tr>
      {rowError && (
        <tr className="wbs-row-error">
          <td colSpan={4}>
            <span className="error">{rowError}</span>
          </td>
        </tr>
      )}
      {node.children.map((c) => (
        <WbsRow
          key={c.task.id}
          node={c}
          depth={depth + 1}
          onReload={onReload}
          tasks={tasks}
          projectId={projectId}
        />
      ))}
    </>
  );
}

function WbsHelp() {
  return (
    <div className="wbs-help-area">
      <details className="wbs-help">
        <summary>ヒント: ワークパッケージと自動集計</summary>
        <p>
          子を持たないタスク＝<strong>ワークパッケージ</strong>（WP）です。所要日数と進捗は
          ワークパッケージに入力します。親タスクの所要日数・進捗は子の値から
          <strong>自動集計（ロールアップ）</strong>されるため、直接入力する必要はありません。
        </p>
      </details>
      <details className="wbs-help">
        <summary>キーボード操作</summary>
        <ul className="wbs-shortcut-list">
          {WBS_SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd> {s.description}
            </li>
          ))}
        </ul>
        <p className="muted">
          行操作は、タスク名をクリックして編集中か、Tabキーで行を選択した状態で使えます。
        </p>
      </details>
    </div>
  );
}

export default function WbsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    api
      .listTasks(projectId)
      .then(setTasks)
      .catch((e: Error) => setError(e.message));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectId 変更時のみ再取得
  useEffect(() => {
    reload();
  }, [projectId]);

  const addRoot = async () => {
    if (!projectId) return;
    try {
      await api.createTask(projectId, { name: "新しいタスク" });
      setError(null);
      reload();
    } catch (e) {
      setError(
        `タスクの追加に失敗しました: ${e instanceof Error ? e.message : e}。再度お試しください。`,
      );
    }
  };

  const tree = buildWbsTree(tasks);

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>WBS</h2>
        <button type="button" onClick={addRoot}>
          ルートタスクを追加
        </button>
      </div>
      <WbsHelp />
      {error && <p className="error">{error}</p>}
      {tasks.length === 0 ? (
        <p className="muted">タスクがありません。「ルートタスクを追加」から始めましょう。</p>
      ) : (
        <table className="wbs-table">
          <thead>
            <tr>
              <th>タスク名</th>
              <th>所要日数</th>
              <th>進捗</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((n) => (
              <WbsRow
                key={n.task.id}
                node={n}
                depth={0}
                onReload={reload}
                tasks={tasks}
                projectId={projectId ?? ""}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
