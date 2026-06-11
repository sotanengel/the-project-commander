import type { DependencyType, ProjectPlan, Task } from "@tpc/shared";
import { type FormEvent, useState } from "react";
import { api } from "../../api/client.js";
import { DEPENDENCY_TYPE_OPTIONS } from "./networkModel.js";

interface Props {
  projectId: string;
  plan: ProjectPlan;
  /** WBS順の葉タスク（ワークパッケージ） */
  leaves: Task[];
  /** 依存関係の作成/削除後に計画を再取得する */
  onChanged: () => void;
}

/** 依存関係の追加フォームと一覧テーブル */
export default function DependencyEditor({ projectId, plan, leaves, onChanged }: Props) {
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [type, setType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const taskName = (id: string) => plan.tasks.find((t) => t.id === id)?.name ?? id;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!predecessorId || !successorId) {
      setFormError("先行タスクと後続タスクを選択してください");
      return;
    }
    if (predecessorId === successorId) {
      setFormError("先行タスクと後続タスクには別のタスクを選択してください");
      return;
    }
    const lag = Number(lagDays);
    if (lagDays.trim() === "" || !Number.isFinite(lag)) {
      setFormError("ラグ日数は数値で入力してください");
      return;
    }
    setSubmitting(true);
    try {
      await api.createDependency(projectId, { predecessorId, successorId, type, lagDays: lag });
      setFormError(null);
      setPredecessorId("");
      setSuccessorId("");
      setType("FS");
      setLagDays("0");
      onChanged();
    } catch (err) {
      // 409（循環）や400のAPI日本語メッセージをそのまま表示する
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (dependencyId: string) => {
    if (deletingId !== null) return;
    setDeletingId(dependencyId);
    try {
      await api.deleteDependency(dependencyId);
      setFormError(null);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h3>依存関係の追加</h3>
      <form className="dependency-form" onSubmit={submit}>
        <label>
          先行タスク
          <select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
            <option value="">選択してください</option>
            {leaves.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          後続タスク
          <select value={successorId} onChange={(e) => setSuccessorId(e.target.value)}>
            <option value="">選択してください</option>
            {leaves.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          タイプ
          <select value={type} onChange={(e) => setType(e.target.value as DependencyType)}>
            {DEPENDENCY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ラグ日数（負=リード）
          <input
            type="number"
            className="dependency-lag-input"
            value={lagDays}
            onChange={(e) => setLagDays(e.target.value)}
          />
        </label>
        <button type="submit" disabled={submitting}>
          追加
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}

      {plan.dependencies.length > 0 ? (
        <table className="dependency-table">
          <thead>
            <tr>
              <th>先行タスク</th>
              <th>後続タスク</th>
              <th>タイプ</th>
              <th>ラグ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plan.dependencies.map((d) => (
              <tr key={d.id}>
                <td>{taskName(d.predecessorId)}</td>
                <td>{taskName(d.successorId)}</td>
                <td>{d.type}</td>
                <td>{d.lagDays}日</td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    disabled={deletingId !== null}
                    onClick={() => remove(d.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">依存関係はまだ登録されていません。</p>
      )}
    </div>
  );
}
