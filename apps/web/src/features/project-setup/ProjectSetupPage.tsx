import type { Project } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { formatImportError } from "../ai-assist/aiAssistModel.js";
import {
  type ParsedImport,
  countTasks,
  flattenTasks,
  parseAiResponse,
} from "../ai-assist/importLogic.js";
import { buildNewProjectPrompt } from "./buildNewProjectPrompt.js";
import "./setup.css";

/**
 * 新規プロジェクト作成直後のAIタスク生成セットアップ画面。
 */
export default function ProjectSetupPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [preview, setPreview] = useState<ParsedImport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p);
        setPrompt(buildNewProjectPrompt(p, window.location.origin));
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  const resetFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage("プロンプトをコピーしました");
      setError(null);
    } catch {
      setError("クリップボードへのコピーに失敗しました");
      setMessage(null);
    }
  };

  const validateAndPreview = () => {
    resetFeedback();
    setPreview(null);
    try {
      const parsed = parseAiResponse(jsonInput, "wbs_draft");
      if (parsed.kind !== "tasks") {
        setError("タスク形式のJSONではありません");
        return;
      }
      setPreview(parsed);
    } catch (e) {
      setError(formatImportError(e));
    }
  };

  const cancelPreview = () => {
    resetFeedback();
    setPreview(null);
    setMessage("取り込みをキャンセルしました");
  };

  const confirmImport = async () => {
    if (!projectId || !preview || preview.kind !== "tasks") return;
    resetFeedback();
    setImporting(true);
    try {
      await api.createTasksBulk(projectId, preview.tasks);
      const count = countTasks(preview.tasks);
      setPreview(null);
      setJsonInput("");
      setMessage(`${count}件のタスクを取り込みました。WBSで確認できます。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  if (error && !project) {
    return (
      <section className="card">
        <p className="error">{error}</p>
        <Link to="/">← ダッシュボードに戻る</Link>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>AIでタスクを生成する</h2>
      <p className="muted">
        プロジェクト「{project?.name ?? "読み込み中…"}
        」の概要に基づき、生成AIへWBSドラフトを依頼するプロンプトです。
      </p>
      <ol className="setup-steps">
        <li>下のプロンプトをコピーして、ChatGPT等の生成AIに貼り付けて送信する</li>
        <li>返ってきたJSONを下の「AI応答の取り込み」欄に貼り付けて取り込む</li>
        <li>WBSタブで内容を確認・調整する</li>
      </ol>
      {error && <p className="error">{error}</p>}
      {message && <p className="badge">{message}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" onClick={copyPrompt} disabled={!prompt}>
          プロンプトをコピー
        </button>
      </div>
      <textarea
        readOnly
        value={prompt}
        rows={12}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        aria-label="AIタスク生成プロンプト"
      />

      <h3 style={{ marginTop: 24 }}>AI応答の取り込み</h3>
      <p className="muted">
        ChatGPT等が返したJSONをそのまま貼り付けてください（```json フェンス付きでも取り込めます）。
      </p>
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder='例: { "tasks": [{ "name": "フェーズ1", "durationDays": 5, "children": [...] }] }'
        rows={8}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        aria-label="AI応答JSON"
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={validateAndPreview}
          disabled={!jsonInput.trim() || importing}
        >
          検証してプレビュー
        </button>
      </div>

      {preview?.kind === "tasks" && (
        <div className="card setup-preview" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>取り込みプレビュー</h4>
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

      <div className="row setup-links" style={{ marginTop: 16 }}>
        {projectId && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              WBSを開く
            </button>
            <Link to={`/projects/${projectId}/ai`}>AIアシストでも取り込める</Link>
          </>
        )}
        <Link to="/">ダッシュボードに戻る</Link>
      </div>
    </section>
  );
}
