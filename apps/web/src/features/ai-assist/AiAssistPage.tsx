import { ExportBundleSchema, type Project, type ProjectPlan } from "@tpc/shared";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import {
  type ImportSummary,
  type ParsedImport,
  buildExportFileName,
  countTasks,
  flattenTasks,
  importOneByOne,
  parseAiResponse,
  resolveDependencies,
} from "./importLogic.js";
import { type PromptPurpose, buildPrompt } from "./prompts.js";

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
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  // データ連携
  const [exporting, setExporting] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importedProject, setImportedProject] = useState<Project | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
    setSummary(null);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("プロンプトをコピーしました");
    } catch {
      setError("クリップボードへのコピーに失敗しました");
    }
  };

  /** 貼り付けたAI応答を検証してプレビューを表示する（この時点では取り込まない） */
  const validateAndPreview = () => {
    resetFeedback();
    setPreview(null);
    try {
      setPreview(parseAiResponse(jsonInput, purpose));
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSONの検証に失敗しました");
    }
  };

  const cancelPreview = () => {
    resetFeedback();
    setPreview(null);
    setMessage("取り込みをキャンセルしました");
  };

  /** プレビュー内容を確定して取り込む */
  const confirmImport = async () => {
    if (!projectId || !plan || !preview) return;
    resetFeedback();
    setImporting(true);
    try {
      if (preview.kind === "tasks") {
        await api.createTasksBulk(projectId, preview.tasks);
        setMessage(`${countTasks(preview.tasks)}件のタスクを取り込みました`);
      } else if (preview.kind === "risks") {
        setSummary(
          await importOneByOne(
            preview.risks,
            (risk) => risk.title,
            (risk) => api.createRisk(projectId, risk),
          ),
        );
      } else {
        const resolution = resolveDependencies(preview.dependencies, plan.tasks);
        setSummary(
          await importOneByOne(
            resolution.resolved,
            (dep) => dep.label,
            (dep) => api.createDependency(projectId, dep.input),
            resolution.failures,
          ),
        );
      }
      setPreview(null);
      setJsonInput("");
      // 取り込み自体は完了しているため、再読み込みの失敗は取り込み失敗と区別して伝える
      try {
        const refreshed = await api.getPlan(projectId);
        setPlan(refreshed);
        setPrompt(buildPrompt(refreshed, purpose));
      } catch {
        setError(
          "取り込みは完了しましたが、プランの再読み込みに失敗しました。ページを再読み込みしてください。",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  /** プロジェクト一式をJSONファイルとしてダウンロードする */
  const exportProject = async () => {
    if (!projectId || !plan) return;
    resetFeedback();
    setExporting(true);
    try {
      const bundle = await api.exportProject(projectId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildExportFileName(plan.project.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("エクスポートファイルをダウンロードしました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  /** エクスポートJSONファイルを検証し、新しいプロジェクトとして取り込む */
  const importBundleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを再選択してもonChangeが発火するようにリセット
    event.target.value = "";
    if (!file) return;
    resetFeedback();
    setImportedProject(null);
    setImportingFile(true);
    try {
      const text = await file.text();
      let raw: unknown;
      try {
        raw = JSON.parse(text) as unknown;
      } catch {
        setError(
          "ファイルがJSONとして読み取れません。エクスポートしたファイルを選択してください。",
        );
        return;
      }
      const parsed = ExportBundleSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue && issue.path.length > 0 ? issue.path.join(".") : "(ルート)";
        setError(
          `エクスポート形式として正しくありません: ${path}: ${issue?.message ?? "不明なエラー"}`,
        );
        return;
      }
      const project = await api.importProject(parsed.data);
      setImportedProject(project);
      setMessage("新しいプロジェクトとして取り込みました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setImportingFile(false);
    }
  };

  return (
    <section className="card">
      <h2>AIアシスト</h2>
      <p className="muted">
        プロンプトをコピーしてChatGPT等に貼り付け、返ってきたJSONを下の欄に貼り付けて取り込みます。
        ```jsonフェンスや前後の説明文が付いたままでも取り込めます。
      </p>
      {error && <p className="error">{error}</p>}
      {message && <p className="badge">{message}</p>}
      {summary && (
        <div style={{ marginBottom: 12 }}>
          <p className="badge">
            取り込み結果: 成功{summary.succeeded}件 / 失敗{summary.failed}件
          </p>
          {summary.failures.length > 0 && (
            <ul className="error" style={{ marginTop: 4 }}>
              {summary.failures.map((f, i) => (
                <li key={`${i}-${f.label}`}>
                  {f.label}: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          目的
          <select
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value as PromptPurpose);
              setPreview(null);
            }}
          >
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
        placeholder='AIの応答をそのまま貼り付けてください（例: ```json { "tasks": [...] } ```）'
        rows={8}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
      />
      <button
        type="button"
        onClick={validateAndPreview}
        disabled={!jsonInput.trim() || importing}
        style={{ marginTop: 8 }}
      >
        検証してプレビュー
      </button>

      {preview && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>取り込みプレビュー</h4>
          {preview.kind === "tasks" && (
            <>
              <p>追加されるタスク: {countTasks(preview.tasks)}件</p>
              <ul style={{ fontFamily: "monospace", fontSize: 12, listStyle: "none", padding: 0 }}>
                {flattenTasks(preview.tasks).map((row, i) => (
                  <li key={`${row.depth}-${row.name}-${i}`}>
                    {"　".repeat(row.depth)}
                    {row.depth > 0 ? "└ " : ""}
                    {row.name}
                    {row.durationDays !== undefined && (
                      <span className="muted">（{row.durationDays}日）</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {preview.kind === "risks" && (
            <>
              <p>追加されるリスク: {preview.risks.length}件</p>
              <ul>
                {preview.risks.map((r, i) => (
                  <li key={`${r.title}-${i}`}>
                    {r.title}
                    <span className="muted">
                      （発生確率: {r.probability ?? "medium"} / 影響度: {r.impact ?? "medium"}）
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {preview.kind === "dependencies" && (
            <>
              <p>追加される依存関係: {preview.dependencies.length}件</p>
              <ul>
                {preview.dependencies.map((d, i) => (
                  <li key={`${d.predecessorName}-${d.successorName}-${i}`}>
                    {d.predecessorName} → {d.successorName}
                    <span className="muted">
                      （{d.type ?? "FS"}
                      {d.lagDays ? ` / ラグ${d.lagDays}日` : ""}）
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="row">
            <button type="button" onClick={confirmImport} disabled={importing}>
              {importing ? "取り込み中…" : "取り込む"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={cancelPreview}
              disabled={importing}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <h3>データ連携</h3>
      <p className="muted">
        プロジェクト一式（タスク・依存・マイルストーン・リスク・関係者・ベースライン）をJSONで
        エクスポート/インポートできます。インポートは新しいプロジェクトとして作成されます。
      </p>
      <div className="row">
        <button type="button" onClick={exportProject} disabled={!plan || exporting}>
          {exporting ? "エクスポート中…" : "JSONエクスポート"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importingFile}
        >
          {importingFile ? "インポート中…" : "JSONインポート"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={importBundleFile}
          style={{ display: "none" }}
          aria-label="エクスポートJSONファイルを選択"
        />
      </div>
      {importedProject && (
        <p style={{ marginTop: 8 }}>
          「{importedProject.name}」を作成しました。<Link to="/">ダッシュボードで確認する</Link>
        </p>
      )}
    </section>
  );
}
