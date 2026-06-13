import type { PlanDraftInput, Project } from "@tpc/shared";
import { buildAiImportManifest, decodePlanDraftPayload } from "@tpc/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { buildNewProjectPrompt } from "./buildNewProjectPrompt.js";
import "./setup.css";

/**
 * 新規プロジェクト作成直後のAIタスク生成セットアップ画面。
 */
export default function ProjectSetupPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const payloadHandled = useRef(false);
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [waiting, setWaiting] = useState(true);

  const importPlan = useCallback(
    async (draft: PlanDraftInput) => {
      if (!projectId) return;
      setImporting(true);
      setError(null);
      try {
        const summary = await api.importPlanDraft(projectId, draft);
        setWaiting(false);
        const depNote =
          summary.dependencies.failed > 0
            ? `（依存関係: 成功${summary.dependencies.succeeded} / 失敗${summary.dependencies.failed}）`
            : "";
        setMessage(
          `フル計画を取り込みました: タスク${summary.tasksCreated}件、依存${summary.dependencies.succeeded}件、マイルストーン${summary.milestones}件、リスク${summary.risks}件、関係者${summary.stakeholders}件${depNote}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "取り込みに失敗しました");
      } finally {
        setImporting(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p);
        const origin = window.location.origin;
        setPrompt(buildNewProjectPrompt(p, origin));
        setManifestUrl(`${origin}/api/projects/${p.id}/ai-import-manifest`);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || payloadHandled.current) return;
    const payload = searchParams.get("payload");
    if (!payload) return;
    payloadHandled.current = true;
    setSearchParams({}, { replace: true });
    try {
      const draft = decodePlanDraftPayload(payload);
      void importPlan(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みデータの解析に失敗しました");
    }
  }, [projectId, searchParams, setSearchParams, importPlan]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(
        "プロンプトをコピーしました。AIに貼り付けて、Web検索でフル計画を送信させてください。",
      );
      setError(null);
    } catch {
      setError("クリップボードへのコピーに失敗しました");
      setMessage(null);
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

  const manifest = project ? buildAiImportManifest(project, window.location.origin) : null;

  return (
    <section className="card">
      <h2>AIでプロジェクト計画を生成する</h2>
      <p className="muted">
        プロジェクト「{project?.name ?? "読み込み中…"}
        」の概要に基づき、WBS・依存関係・マイルストーン・リスク・関係者を含むフル計画を生成AIへ依頼します。
      </p>
      <ol className="setup-steps">
        <li>下のプロンプトをコピーして、ChatGPT等の生成AIに貼り付けて送信する</li>
        <li>
          AIが<strong>Web検索・ブラウジング</strong>
          で取り込みURLへアクセスし、フル計画を自動登録する
        </li>
        <li>WBS・ネットワーク図・ガント・登録簿で内容を確認・調整する</li>
      </ol>

      {waiting && !importing && !message && (
        <p className="badge setup-waiting">AIからの取り込みを待っています…</p>
      )}
      {importing && <p className="badge">フル計画を取り込み中…</p>}
      {error && <p className="error">{error}</p>}
      {message && <p className="badge">{message}</p>}

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" onClick={copyPrompt} disabled={!prompt}>
          プロンプトをコピー
        </button>
        {projectId && message && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              WBSを開く
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/projects/${projectId}/network`)}
            >
              ネットワーク図
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/projects/${projectId}/registers`)}
            >
              登録簿
            </button>
          </>
        )}
      </div>

      {manifest && (
        <details className="setup-manifest">
          <summary>AIがアクセスする取り込みURL</summary>
          <ul className="setup-manifest-list">
            <li>
              <strong>取り込み仕様（JSON）:</strong>{" "}
              <a href={manifestUrl} target="_blank" rel="noreferrer">
                {manifestUrl}
              </a>
            </li>
            <li>
              <strong>フル計画登録 API:</strong> POST{" "}
              {manifest.methods[0]?.type === "http_post" ? manifest.methods[0].url : ""}
            </li>
            <li>
              <strong>ブラウザ取り込み:</strong>{" "}
              {manifest.methods[1]?.type === "browser_navigate"
                ? manifest.methods[1].urlPattern
                : ""}
            </li>
          </ul>
        </details>
      )}

      <textarea
        readOnly
        value={prompt}
        rows={16}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12, marginTop: 12 }}
        aria-label="AIフル計画生成プロンプト"
      />

      <div className="row setup-links" style={{ marginTop: 16 }}>
        <Link to="/">ダッシュボードに戻る</Link>
      </div>
    </section>
  );
}
