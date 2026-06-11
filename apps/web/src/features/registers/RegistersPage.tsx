import type { Milestone, Risk, Stakeholder } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import {
  LEVEL_LABELS,
  type Level,
  MILESTONE_STATUS_LABELS,
  RISK_STATUS_LABELS,
  engagementCategory,
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectId 変更時のみ再取得
  useEffect(() => {
    reload();
  }, [projectId]);

  const addRisk = async () => {
    if (!projectId) return;
    await save(api.createRisk(projectId, { title: "新しいリスク" }));
  };

  const addStakeholder = async () => {
    if (!projectId) return;
    await save(api.createStakeholder(projectId, { name: "新しい関係者" }));
  };

  const addMilestone = async () => {
    if (!projectId) return;
    await save(
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
                <th />
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      defaultValue={s.name}
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
