import { type WbsNode, buildWbsTree } from "@tpc/shared";
import type { Task } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import "./wbs.css";

function WbsRow({
  node,
  depth,
  projectId,
  onOpenTask,
}: {
  node: WbsNode;
  depth: number;
  projectId: string;
  onOpenTask: (taskId: string) => void;
}) {
  const isWorkPackage = node.children.length === 0;

  const openDetail = () => {
    onOpenTask(node.task.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail();
    }
  };

  return (
    <>
      <tr
        className="wbs-row wbs-row-clickable"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={onKeyDown}
        aria-label={`タスク「${node.task.name}」の詳細を開く`}
      >
        <td style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {node.task.name}
          {isWorkPackage && <span className="badge wbs-wp-badge">WP</span>}
        </td>
        <td>{node.rollup.durationDays}</td>
        <td>{`${Math.round(node.rollup.progress)}%`}</td>
      </tr>
      {node.children.map((c) => (
        <WbsRow
          key={c.task.id}
          node={c}
          depth={depth + 1}
          projectId={projectId}
          onOpenTask={onOpenTask}
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
          行をクリックするとタスク詳細を開き、名称・作業内容・担当などを編集できます。
          子タスクは詳細ページの「+ 子タスクを追加」から下書き入力し、
          <strong>保存</strong>するまで作成されません。削除もタスク詳細から行います。
        </p>
      </details>
    </div>
  );
}

export default function WbsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
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

  const openTask = (taskId: string) => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/tasks/${taskId}`);
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
            </tr>
          </thead>
          <tbody>
            {tree.map((n) => (
              <WbsRow
                key={n.task.id}
                node={n}
                depth={0}
                projectId={projectId ?? ""}
                onOpenTask={openTask}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
