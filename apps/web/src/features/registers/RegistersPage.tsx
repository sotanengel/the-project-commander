import type { Milestone, Risk, Stakeholder } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client.js";

type Tab = "risks" | "stakeholders" | "milestones";

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
        setRisks(r);
        setStakeholders(s);
        setMilestones(m);
      })
      .catch((e: Error) => setError(e.message));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectId 変更時のみ再取得
  useEffect(() => {
    reload();
  }, [projectId]);

  const addRisk = async () => {
    if (!projectId) return;
    await api.createRisk(projectId, { title: "新しいリスク" });
    reload();
  };

  const addStakeholder = async () => {
    if (!projectId) return;
    await api.createStakeholder(projectId, { name: "新しい関係者" });
    reload();
  };

  const addMilestone = async () => {
    if (!projectId) return;
    await api.createMilestone(projectId, {
      name: "新しいマイルストーン",
      dueDate: new Date().toISOString().slice(0, 10),
    });
    reload();
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
                <th>対応</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      defaultValue={r.title}
                      onBlur={(e) => api.updateRisk(r.id, { title: e.target.value }).then(reload)}
                    />
                  </td>
                  <td>{r.probability}</td>
                  <td>{r.impact}</td>
                  <td>
                    <input
                      defaultValue={r.response}
                      onBlur={(e) =>
                        api.updateRisk(r.id, { response: e.target.value }).then(reload)
                      }
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => api.deleteRisk(r.id).then(reload)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
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
                <th />
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      defaultValue={s.name}
                      onBlur={(e) =>
                        api.updateStakeholder(s.id, { name: e.target.value }).then(reload)
                      }
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={s.role}
                      onBlur={(e) =>
                        api.updateStakeholder(s.id, { role: e.target.value }).then(reload)
                      }
                    />
                  </td>
                  <td>{s.influence}</td>
                  <td>{s.interest}</td>
                  <td>
                    <button type="button" onClick={() => api.deleteStakeholder(s.id).then(reload)}>
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
                <tr key={m.id}>
                  <td>
                    <input
                      defaultValue={m.name}
                      onBlur={(e) =>
                        api.updateMilestone(m.id, { name: e.target.value }).then(reload)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      defaultValue={m.dueDate}
                      onBlur={(e) =>
                        api.updateMilestone(m.id, { dueDate: e.target.value }).then(reload)
                      }
                    />
                  </td>
                  <td>{m.status}</td>
                  <td>
                    <button type="button" onClick={() => api.deleteMilestone(m.id).then(reload)}>
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
