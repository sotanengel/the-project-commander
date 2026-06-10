import type { ProjectPlan } from "@tpc/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { z } from "zod";
import { type BulkTaskInput, api } from "../../api/client.js";
import { type PromptPurpose, buildPrompt } from "./prompts.js";

const BulkTaskSchema: z.ZodType<BulkTaskInput> = z.object({
  name: z.string().min(1),
  durationDays: z.number().optional(),
  description: z.string().optional(),
  children: z.lazy(() => z.array(BulkTaskSchema)).optional(),
});

const WbsImportSchema = z.object({
  tasks: z.array(BulkTaskSchema),
});

const RiskImportSchema = z.object({
  risks: z.array(
    z.object({
      title: z.string().min(1),
      probability: z.enum(["low", "medium", "high"]).optional(),
      impact: z.enum(["low", "medium", "high"]).optional(),
      response: z.string().optional(),
    }),
  ),
});

const PURPOSES: { id: PromptPurpose; label: string }[] = [
  { id: "wbs_draft", label: "WBSドラフト" },
  { id: "task_breakdown", label: "タスク分解" },
  { id: "risk_identify", label: "リスク洗い出し" },
  { id: "dependencies", label: "依存関係提案" },
];

export default function AiAssistPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [purpose, setPurpose] = useState<PromptPurpose>("wbs_draft");
  const [prompt, setPrompt] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .getPlan(projectId)
      .then((p) => {
        setPlan(p);
        setPrompt(buildPrompt(p, purpose));
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId, purpose]);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setMessage("プロンプトをコピーしました");
  };

  const importJson = async () => {
    if (!projectId || !plan) return;
    setError(null);
    setMessage(null);
    try {
      const raw = JSON.parse(jsonInput) as unknown;
      if (purpose === "wbs_draft" || purpose === "task_breakdown") {
        const data = WbsImportSchema.parse(raw);
        await api.createTasksBulk(projectId, data.tasks);
        setMessage(`${data.tasks.length}件のタスクを取り込みました`);
      } else if (purpose === "risk_identify") {
        const data = RiskImportSchema.parse(raw);
        for (const risk of data.risks) {
          await api.createRisk(projectId, risk);
        }
        setMessage(`${data.risks.length}件のリスクを取り込みました`);
      } else {
        const depSchema = z.object({
          dependencies: z.array(
            z.object({
              predecessorName: z.string(),
              successorName: z.string(),
              type: z.enum(["FS", "SS", "FF", "SF"]).optional(),
              lagDays: z.number().optional(),
            }),
          ),
        });
        const data = depSchema.parse(raw);
        const byName = new Map(plan.tasks.map((t) => [t.name, t.id]));
        for (const d of data.dependencies) {
          const pred = byName.get(d.predecessorName);
          const succ = byName.get(d.successorName);
          if (!pred || !succ)
            throw new Error(`タスク名が見つかりません: ${d.predecessorName} → ${d.successorName}`);
          await api.createDependency(projectId, {
            predecessorId: pred,
            successorId: succ,
            type: d.type,
            lagDays: d.lagDays,
          });
        }
        setMessage(`${data.dependencies.length}件の依存を取り込みました`);
      }
      const refreshed = await api.getPlan(projectId);
      setPlan(refreshed);
      setPrompt(buildPrompt(refreshed, purpose));
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSONの検証または取り込みに失敗しました");
    }
  };

  return (
    <section className="card">
      <h2>AIアシスト</h2>
      <p className="muted">
        プロンプトをコピーしてChatGPT等に貼り付け、返ってきたJSONを下の欄に貼り付けて取り込みます。
      </p>
      {error && <p className="error">{error}</p>}
      {message && <p className="badge">{message}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          目的
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as PromptPurpose)}>
            {PURPOSES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={copyPrompt} disabled={!prompt}>
          プロンプトをコピー
        </button>
      </div>
      <textarea
        readOnly
        value={prompt}
        rows={12}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
      />
      <h3>AI応答JSONの取り込み</h3>
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder='{ "tasks": [...] }'
        rows={8}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
      />
      <button type="button" onClick={importJson} style={{ marginTop: 8 }}>
        取り込む
      </button>
    </section>
  );
}
