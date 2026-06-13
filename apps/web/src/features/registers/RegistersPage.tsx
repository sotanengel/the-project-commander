import type { Milestone, Risk, Stakeholder } from "@tpc/shared";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import {
  LEVEL_LABELS,
  type Level,
  MILESTONE_STATUS_LABELS,
  RISK_STATUS_LABELS,
  engagementCategory,
  powerInterestGridRows,
  riskMatrixRows,
  riskScore,
  scoreSeverity,
  sortRisksByScoreDesc,
} from "./registersModel.js";
import "./registers.css";

type Tab = "risks" | "stakeholders" | "milestones";

const LEVELS = Object.keys(LEVEL_LABELS) as Level[];
const RISK_STATUSES = Object.keys(RISK_STATUS_LABELS) as Risk["status"][];
const MILESTONE_STATUSES = Object.keys(MILESTONE_STATUS_LABELS) as Milestone["status"][];

function levelOptions() {
  return LEVELS.map((level) => (
    <option key={level} value={level}>
      {LEVEL_LABELS[level]}
    </option>
  ));
}

/** リスクタブ: 3×3 確率×影響マトリクスの凡例（折りたたみ可） */
function RiskMatrixLegend() {
  const rows = riskMatrixRows();
  return (
    <details className="register-legend" open>
      <summary>スコアの見方（確率×影響マトリクス）</summary>
      <p className="register-legend-note">
        スコア = 確率 × 影響（低=1 / 中=2 / 高=3）。スコアが大きいほど優先的に対応策を検討します。
      </p>
      <table className="legend-matrix">
        <thead>
          <tr>
            <th scope="col">確率 ＼ 影響</th>
            {rows[0]?.map((cell) => (
              <th key={cell.impact} scope="col">
                {LEVEL_LABELS[cell.impact]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const head = row[0];
            if (!head) return null;
            return (
              <tr key={head.probability}>
                <th scope="row">{LEVEL_LABELS[head.probability]}</th>
                {row.map((cell) => (
                  <td key={cell.impact} className={`legend-cell score-${cell.severity}`}>
                    {cell.score}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/** ステークホルダータブ: 2×2 権力・関心グリッドの凡例（折りたたみ可） */
function PowerInterestLegend() {
  const rows = powerInterestGridRows();
  return (
    <details className="register-legend" open>
      <summary>関与区分の見方（権力・関心グリッド）</summary>
      <p className="register-legend-note">
        影響力（権力）と関心の高低の組み合わせで、関係者との関わり方の方針が自動で決まります。
      </p>
      <table className="legend-matrix">
        <thead>
          <tr>
            <th scope="col">影響力 ＼ 関心</th>
            {rows[0]?.map((cell) => (
              <th key={cell.interest} scope="col">
                {LEVEL_LABELS[cell.interest]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const head = row[0];
            if (!head) return null;
            return (
              <tr key={head.influence}>
                <th scope="row">{LEVEL_LABELS[head.influence]}</th>
                {row.map((cell) => (
                  <td key={cell.interest} className="legend-cell">
                    {cell.label}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/** ページ上部: 推奨記入順の短いガイド（折りたたみ可） */
function FillOrderGuide() {
  return (
    <details className="register-guide">
      <summary>おすすめの記入順</summary>
      <ol className="register-guide-list">
        <li>
          <strong>マイルストーン</strong>: まず節目（リリース・レビューなど）の予定日を登録する
        </li>
        <li>
          <strong>リスク</strong>: 節目を妨げそうな不確実な出来事を洗い出し、確率と影響を見積もる
        </li>
        <li>
          <strong>ステークホルダー</strong>: 関係者を挙げ、影響力と関心から関わり方を決める
        </li>
      </ol>
    </details>
  );
}

export default function RegistersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>("risks");
  const [risks, setRisks] = useState<Risk[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    Promise.all([
      api.listRisks(projectId),
      api.listStakeholders(projectId),
      api.listMilestones(projectId),
    ])
      .then(([r, s, m]) => {
        setError(null);
        setRisks(r);
        setStakeholders(s);
        setMilestones(m);
      })
      .catch((e: Error) => setError(e.message));
  };

  /** 保存→再取得。失敗時はエラー表示 */
  const save = (action: Promise<unknown>) =>
    action.then(reload).catch((e: Error) => setError(e.message));

  /** 直近に追加した行のID。再描画後にその行の最初の入力へフォーカスする */
  const pendingFocusId = useRef<string | null>(null);

  /** 追加→新しい行の最初の入力へフォーカス予約→再取得。失敗時はエラー表示 */
  const addAndFocus = (action: Promise<{ id: string }>) =>
    action
      .then((created) => {
        pendingFocusId.current = created.id;
        reload();
      })
      .catch((e: Error) => setError(e.message));

  /** ref コールバック: 追加直後の行ならフォーカスして全選択（連続追加用） */
  const focusIfJustAdded = (el: HTMLInputElement | null, id: string) => {
    if (el && pendingFocusId.current === id) {
      pendingFocusId.current = null;
      el.focus();
      el.select();
    }
  };

  /** Enter で確定（blur で保存）し、続けて次の行を追加する（IME 変換中は無視） */
  const confirmAndAddNext = (e: KeyboardEvent<HTMLInputElement>, addNext: () => void) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.blur();
    addNext();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectId 変更時のみ再取得
  useEffect(() => {
    reload();
  }, [projectId]);

  const addRisk = async () => {
    if (!projectId) return;
    await addAndFocus(api.createRisk(projectId, { title: "新しいリスク" }));
  };

  const addStakeholder = async () => {
    if (!projectId) return;
    await addAndFocus(api.createStakeholder(projectId, { name: "新しい関係者" }));
  };

  const addMilestone = async () => {
    if (!projectId) return;
    await addAndFocus(
      api.createMilestone(projectId, {
        name: "新しいマイルストーン",
        dueDate: new Date().toISOString().slice(0, 10),
      }),
    );
  };

  return (
    <section className="card">
      <h2>リスク / ステークホルダー / マイルストーン</h2>
      {error && <p className="error">{error}</p>}
      <FillOrderGuide />
      <div className="tabs row" style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => setTab("risks")} disabled={tab === "risks"}>
          リスク
        </button>
        <button
          type="button"
          onClick={() => setTab("stakeholders")}
          disabled={tab === "stakeholders"}
        >
          ステークホルダー
        </button>
        <button type="button" onClick={() => setTab("milestones")} disabled={tab === "milestones"}>
          マイルストーン
        </button>
      </div>

      {tab === "risks" && (
        <>
          <RiskMatrixLegend />
          <button type="button" onClick={addRisk}>
            リスクを追加
          </button>
          <table>
            <thead>
              <tr>
                <th>タイトル</th>
                <th>確率</th>
                <th>影響</th>
                <th>スコア</th>
                <th>状態</th>
                <th>対応</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortRisksByScoreDesc(risks).map((r) => {
                const score = riskScore(r.probability, r.impact);
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        defaultValue={r.title}
                        ref={(el) => focusIfJustAdded(el, r.id)}
                        onKeyDown={(e) => confirmAndAddNext(e, addRisk)}
                        onBlur={(e) => save(api.updateRisk(r.id, { title: e.target.value }))}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="確率"
                        value={r.probability}
                        onChange={(e) =>
                          save(api.updateRisk(r.id, { probability: e.target.value as Level }))
                        }
                      >
                        {levelOptions()}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label="影響"
                        value={r.impact}
                        onChange={(e) =>
                          save(api.updateRisk(r.id, { impact: e.target.value as Level }))
                        }
                      >
                        {levelOptions()}
                      </select>
                    </td>
                    <td>
                      <span className={`badge score-${scoreSeverity(score)}`}>{score}</span>
                    </td>
                    <td>
                      <select
                        aria-label="状態"
                        value={r.status}
                        onChange={(e) =>
                          save(api.updateRisk(r.id, { status: e.target.value as Risk["status"] }))
                        }
                      >
                        {RISK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {RISK_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        defaultValue={r.response}
                        onBlur={(e) => save(api.updateRisk(r.id, { response: e.target.value }))}
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => save(api.deleteRisk(r.id))}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {tab === "stakeholders" && (
        <>
          <PowerInterestLegend />
          <button type="button" onClick={addStakeholder}>
            関係者を追加
          </button>
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>役割</th>
                <th>影響力</th>
                <th>関心</th>
                <th>関与区分</th>
                <th>関与方針メモ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      defaultValue={s.name}
                      ref={(el) => focusIfJustAdded(el, s.id)}
                      onKeyDown={(e) => confirmAndAddNext(e, addStakeholder)}
                      onBlur={(e) => save(api.updateStakeholder(s.id, { name: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={s.role}
                      onBlur={(e) => save(api.updateStakeholder(s.id, { role: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      aria-label="影響力"
                      value={s.influence}
                      onChange={(e) =>
                        save(api.updateStakeholder(s.id, { influence: e.target.value as Level }))
                      }
                    >
                      {levelOptions()}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label="関心"
                      value={s.interest}
                      onChange={(e) =>
                        save(api.updateStakeholder(s.id, { interest: e.target.value as Level }))
                      }
                    >
                      {levelOptions()}
                    </select>
                  </td>
                  <td>
                    <span className="badge">{engagementCategory(s.influence, s.interest)}</span>
                  </td>
                  <td>
                    <textarea
                      className="register-note-input"
                      defaultValue={s.note}
                      rows={2}
                      placeholder="関わり方の方針・メモ"
                      onBlur={(e) => save(api.updateStakeholder(s.id, { note: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => save(api.deleteStakeholder(s.id))}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === "milestones" && (
        <>
          <button type="button" onClick={addMilestone}>
            マイルストーンを追加
          </button>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>期日</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} className={m.status === "done" ? "milestone-done" : undefined}>
                  <td>
                    <input
                      defaultValue={m.name}
                      ref={(el) => focusIfJustAdded(el, m.id)}
                      onKeyDown={(e) => confirmAndAddNext(e, addMilestone)}
                      onBlur={(e) => save(api.updateMilestone(m.id, { name: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      defaultValue={m.dueDate}
                      onBlur={(e) => save(api.updateMilestone(m.id, { dueDate: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      aria-label="状態"
                      value={m.status}
                      onChange={(e) =>
                        save(
                          api.updateMilestone(m.id, {
                            status: e.target.value as Milestone["status"],
                          }),
                        )
                      }
                    >
                      {MILESTONE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {MILESTONE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" onClick={() => save(api.deleteMilestone(m.id))}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
