import type { Project } from "@tpc/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { ProjectCreateInput } from "./ProjectCreateModal.js";
import { validateProjectDescription, validateProjectName } from "./projectForm.js";

interface ProjectEditModalProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ProjectCreateInput) => Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

/**
 * 既存プロジェクトの設定編集モーダル。
 */
export default function ProjectEditModal({
  project,
  open,
  onClose,
  onSubmit,
  submitting = false,
  error = null,
}: ProjectEditModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  const nameError = validateProjectName(name);
  const descriptionError = validateProjectDescription(description);
  const canSubmit = nameError === null && descriptionError === null && startDate !== "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && project) {
      setName(project.name);
      setDescription(project.description);
      setStartDate(project.startDate);
      setNameTouched(false);
      setDescriptionTouched(false);
      if (!dialog.open) dialog.showModal();
      nameRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, project]);

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
          プロジェクト設定
        </h2>
        <form onSubmit={handleSubmit} noValidate>
          <label className="modal-field">
            プロジェクト名
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="プロジェクト名"
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
              {submitting ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
