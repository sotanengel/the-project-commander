import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CHECKLIST_STEPS, FOCUS_AREAS, GLOSSARY_TERMS, filterTerms } from "./guideModel.js";
import "./guide.css";

/**
 * ガイドページ（プロジェクト非依存の静的ページ）。
 * PMBOK用語集 / Focus Areas とアプリ操作の対応表 / はじめかたチェックリストを提供する。
 */
export default function GuidePage() {
  const [query, setQuery] = useState("");
  const visibleTerms = useMemo(() => filterTerms(GLOSSARY_TERMS, query), [query]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand">
          ⌘ The Project Commander
        </Link>
        <span className="project-name">ガイド</span>
        <nav className="tabs">
          <Link to="/">ダッシュボードへ戻る</Link>
        </nav>
      </header>
      <main className="container guide">
        <h1>使い方ガイド</h1>
        <p className="muted">
          PMBOKの考え方とこのアプリの使い方を、初学者向けにまとめたページです。
        </p>
        <nav className="row guide-toc" aria-label="ページ内目次">
          <a href="#checklist" className="badge">
            はじめかたチェックリスト
          </a>
          <a href="#focus-areas" className="badge">
            5つのFocus Areas
          </a>
          <a href="#glossary" className="badge">
            PMBOK用語集
          </a>
        </nav>

        <section id="checklist" className="card">
          <h2>はじめかたチェックリスト</h2>
          <p className="muted">迷ったらこの順番で進めれば大丈夫です。</p>
          <ol className="guide-checklist">
            {CHECKLIST_STEPS.map((s) => (
              <li key={s.step}>
                <span className="guide-step-number">{s.step}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.description}</p>
                  <p className="muted guide-location">画面: {s.location}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="focus-areas" className="card">
          <h2>PMBOKの5つのFocus Areasとアプリ操作</h2>
          <p className="muted">
            プロジェクトの段階（立ち上げ〜終結）ごとに、このアプリで行う操作の対応表です。
          </p>
          <table className="guide-focus-table">
            <thead>
              <tr>
                <th>段階</th>
                <th>何をする段階か</th>
                <th>このアプリでの操作</th>
              </tr>
            </thead>
            <tbody>
              {FOCUS_AREAS.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.name}</th>
                  <td>{a.description}</td>
                  <td>
                    <ul className="guide-action-list">
                      {a.appActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="glossary" className="card">
          <h2>PMBOK用語集</h2>
          <div className="row guide-glossary-controls">
            <label className="grow">
              用語を検索（例: SPI、フロート、依存）
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="キーワードで絞り込み"
                aria-label="用語フィルタ"
              />
            </label>
          </div>
          <nav className="row guide-anchor-list" aria-label="用語へジャンプ">
            {GLOSSARY_TERMS.map((t) => (
              <a key={t.id} href={`#term-${t.id}`} className="badge">
                {t.term}
              </a>
            ))}
          </nav>
          {visibleTerms.length === 0 ? (
            <p className="muted">
              「{query}」に一致する用語はありません。別のキーワードを試してください。
            </p>
          ) : (
            <dl className="guide-glossary">
              {visibleTerms.map((t) => (
                <div key={t.id} id={`term-${t.id}`} className="guide-term">
                  <dt>{t.term}</dt>
                  <dd>
                    <p>{t.definition}</p>
                    <p className="muted guide-location">アプリでは: {t.usage}</p>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </main>
    </div>
  );
}
