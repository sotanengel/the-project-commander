import type { CommentSuggestion } from "@tpc/shared";
import { describeSuggestionChanges } from "./commentSuggestionModel.js";

interface CommentSuggestionCardsProps {
  visible: boolean;
  analyzing: boolean;
  suggestions: CommentSuggestion[];
  notice: string | null;
  onApply: (suggestion: CommentSuggestion) => Promise<void>;
  applyingId: string | null;
  applyErrors: Record<string, string>;
  onDismiss: (suggestionId: string) => void;
}

export default function CommentSuggestionCards({
  visible,
  analyzing,
  suggestions,
  notice,
  onApply,
  applyingId,
  applyErrors,
  onDismiss,
}: CommentSuggestionCardsProps) {
  if (!visible && !analyzing && !notice) {
    return null;
  }

  return (
    <aside className="comment-suggestion-panel" aria-live="polite" aria-label="AI からの変更提案">
      <h3 className="comment-suggestion-panel-title">AI からの変更提案</h3>
      {analyzing ? (
        <p className="muted comment-suggestion-panel-status">AI が提案を分析中…</p>
      ) : notice ? (
        <p className="muted comment-suggestion-panel-status">{notice}</p>
      ) : suggestions.length === 0 ? (
        <p className="muted comment-suggestion-panel-status">変更提案はありませんでした。</p>
      ) : (
        <ul className="comment-suggestion-list">
          {suggestions.map((suggestion) => {
            const changes = describeSuggestionChanges(suggestion);
            const error = applyErrors[suggestion.id];
            return (
              <li key={suggestion.id} className="card comment-suggestion-card">
                <h4 className="comment-suggestion-card-title">{suggestion.label}</h4>
                <p className="comment-suggestion-rationale">{suggestion.rationale}</p>
                {changes.length > 0 && (
                  <ul className="comment-suggestion-diff">
                    {changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {error && <p className="error">{error}</p>}
                <div className="comment-suggestion-actions">
                  <button
                    type="button"
                    disabled={applyingId !== null}
                    onClick={() => void onApply(suggestion)}
                  >
                    {applyingId === suggestion.id ? "反映中…" : "反映"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={applyingId !== null}
                    onClick={() => onDismiss(suggestion.id)}
                  >
                    スキップ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
