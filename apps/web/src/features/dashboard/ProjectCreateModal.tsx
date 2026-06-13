import { todayLocal } from "@tpc/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { validateProjectDescription, validateProjectName } from "./projectForm.js";

export interface ProjectCreateInput {
  name: string;
  description: string;
  startDate: string;
}

interface ProjectCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ProjectCreateInput) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

/**
 * 新規プロジェクト作成モーダル。
 */
export default function ProjectCreateModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  error = null,
}: ProjectCreateModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayLocal());
  const [nameTouched, setNameTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  const nameError = validateProjectName(name);
  const descriptionError = validateProjectDescription(description);
  const canSubmit = nameError === null && descriptionError === null && startDate !== "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setName("");
      setDescription("");
      setStartDate(todayLocal());
      setNameTouched(false);
      setDescriptionTouched(false);
      if (!dialog.open) dialog.showModal();
      nameRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleDialogClose = () => {
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    setDescriptionTouched(true);
    if (!canSubmit) return;
    await onSubmit({ name: name.trim(), description: description.trim(), startDate });
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="card modal-card">
        <h2 id={titleId} className="modal-title">
          新規プロジェクト
        </h2>
        <form onSubmit={handleSubmit} noValidate>
          <label className="modal-field">
            プロジェクト名
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="新しいプロジェクト名"
              aria-invalid={nameTouched && nameError !== null}
              required
            />
          </label>
          {nameTouched && nameError && <p className="error form-field-error">{nameError}</p>}

          <label className="modal-field">
            プロジェクトの概要
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              placeholder="プロジェクトの目的・範囲・成果物など"
              rows={4}
              aria-invalid={descriptionTouched && descriptionError !== null}
              required
            />
          </label>
          {descriptionTouched && descriptionError && (
            <p className="error form-field-error">{descriptionError}</p>
          )}

          <label className="modal-field">
            開始日
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
              キャンセル
            </button>
            <button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "作成中…" : "作成"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
