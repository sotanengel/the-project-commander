import { type WbsNode, buildWbsTree } from "@tpc/shared";
import type { Task } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import {
  type TaskUpdatePlan,
  countDescendants,
  indentTask,
  insertSiblingPlan,
  moveTask,
  outdentTask,
} from "./wbsOps.js";

async function applyUpdates(updates: TaskUpdatePlan[]) {
  for (const u of updates) {
    await api.updateTask(u.id, u.input);
  }
}

function WbsRow({
  node,
  depth,
  onReload,
  tasks,
}: {
  node: WbsNode;
  depth: number;
  onReload: () => void;
  tasks: Task[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.task.name);
  const [duration, setDuration] = useState(String(node.task.durationDays));

  const save = async () => {
    await api.updateTask(node.task.id, {
      name,
      durationDays: Number(duration) || 0,
    });
    setEditing(false);
    onReload();
  };

  const run = async (fn: () => TaskUpdatePlan[] | null) => {
    const updates = fn();
    if (!updates || updates.length === 0) return;
    await applyUpdates(updates);
    onReload();
  };

  const addSibling = async () => {
    const plan = insertSiblingPlan(tasks, node.task.id);
    if (!plan) return;
    await applyUpdates(plan.bumps);
    await api.createTask(node.task.projectId, {
      name: "新しいタスク",
      parentId: plan.parentId,
      sortOrder: plan.sortOrder,
    });
    onReload();
  };

  const addChild = async () => {
    await api.createTask(node.task.projectId, {
      name: "新しい子タスク",
      parentId: node.task.id,
    });
    onReload();
  };

  const remove = async () => {
    const n = countDescendants(tasks, node.task.id);
    const msg =
      n > 0
        ? `「${node.task.name}」と子タスク${n}件を削除しますか？`
        : `「${node.task.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    await api.deleteTask(node.task.id);
    onReload();
  };

  return (
    <>
      <tr className="wbs-row">
        <td style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {editing ? (
            <input value={name} onChange={(e) => setName(e.target.value)} />
          ) : (
            <button type="button" className="linkish" onClick={() => setEditing(true)}>
              {node.task.name}
            </button>
          )}
        </td>
        <td>
          {editing ? (
            <input
              type="number"
              min={0}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{ width: 64 }}
            />
          ) : (
            node.rollup.durationDays
          )}
        </td>
        <td>{Math.round(node.rollup.progress)}%</td>
        <td className="wbs-actions">
          {editing ? (
            <>
              <button type="button" onClick={save}>
                保存
              </button>
              <button type="button" className="muted-btn" onClick={() => setEditing(false)}>
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                title="上へ"
                onClick={() => run(() => moveTask(tasks, node.task.id, "up"))}
              >
                ↑
              </button>
              <button
                type="button"
                title="下へ"
                onClick={() => run(() => moveTask(tasks, node.task.id, "down"))}
              >
                ↓
              </button>
              <button
                type="button"
                title="インデント"
                onClick={() => run(() => indentTask(tasks, node.task.id))}
              >
                →
              </button>
              <button
                type="button"
                title="アウトデント"
                onClick={() => run(() => outdentTask(tasks, node.task.id))}
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
      {node.children.map((c) => (
        <WbsRow key={c.task.id} node={c} depth={depth + 1} onReload={onReload} tasks={tasks} />
      ))}
    </>
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
    await api.createTask(projectId, { name: "新しいタスク" });
    reload();
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
              <WbsRow key={n.task.id} node={n} depth={0} onReload={reload} tasks={tasks} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
