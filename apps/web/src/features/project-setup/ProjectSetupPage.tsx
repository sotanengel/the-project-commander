import type { Project } from "@tpc/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { buildNewProjectPrompt } from "./buildNewProjectPrompt.js";

/**
 * 新規プロジェクト作成直後のAIタスク生成セットアップ画面。
 */
export default function ProjectSetupPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <li>返ってきたJSONを取り込む（手動またはMCP自動登録）</li>
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
        rows={16}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        aria-label="AIタスク生成プロンプト"
      />
      <div className="row setup-links" style={{ marginTop: 16 }}>
        {projectId && (
          <>
            <Link to={`/projects/${projectId}/ai`}>AIアシストで取り込む</Link>
            <Link to={`/projects/${projectId}`}>WBSを開く</Link>
          </>
        )}
        <Link to="/">ダッシュボードに戻る</Link>
      </div>
    </section>
  );
}
