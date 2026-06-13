import type { CommentSuggestion } from "@tpc/shared";
import { useEffect, useId, useRef } from "react";
import { describeSuggestionChanges } from "./commentSuggestionModel.js";

interface CommentSuggestionDialogProps {
  open: boolean;
  suggestions: CommentSuggestion[];
  analyzing?: boolean;
  onClose: () => void;
  onApply: (suggestion: CommentSuggestion) => Promise<void>;
  applyingId: string | null;
  applyErrors: Record<string, string>;
  onDismiss: (suggestionId: string) => void;
}

export default function CommentSuggestionDialog({
  open,
  suggestions,
  analyzing = false,
  onClose,
  onApply,
  applyingId,
  applyErrors,
  onDismiss,
}: CommentSuggestionDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleDialogClose = () => {
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog comment-suggestion-dialog"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
    >
      <div className="card modal-card comment-suggestion-dialog-card">
        <h2 id={titleId} className="modal-title">
          AI からの変更提案
        </h2>
        {analyzing ? (
          <p className="muted">AI が提案を分析中…</p>
        ) : suggestions.length === 0 ? (
          <p className="muted">提案はありません。</p>
        ) : (
          <ul className="comment-suggestion-list">
            {suggestions.map((suggestion) => {
              const changes = describeSuggestionChanges(suggestion);
              const error = applyErrors[suggestion.id];
              return (
                <li key={suggestion.id} className="card comment-suggestion-card">
                  <h3 className="comment-suggestion-card-title">{suggestion.label}</h3>
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
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={handleDialogClose}>
            閉じる
          </button>
        </div>
      </div>
    </dialog>
  );
}
