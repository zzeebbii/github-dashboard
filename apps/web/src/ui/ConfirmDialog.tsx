import { useId } from "react";
import { Dialog } from "./Dialog.tsx";

interface ConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  /** Esc, Cancel or a backdrop click. */
  readonly onCancel: () => void;
}

/**
 * A confirmation for a destructive action. Rendered only while it is asked; a modal
 * ui/Dialog.tsx, so focus stays inside, Esc cancels and focus returns to whatever had it
 * before. Cancel gets the initial focus: the safe choice is the default.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const id = useId();
  return (
    <Dialog
      className="confirm-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onClose={onCancel}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-body`}>{body}</p>
      <div className="confirm-actions">
        {/* First, so showModal() focuses it. */}
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
