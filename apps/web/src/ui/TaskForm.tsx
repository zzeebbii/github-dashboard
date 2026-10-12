import { CreateTaskSchema, TASK_TITLE_MAX_LENGTH } from "@kit/contracts";
import { useState, type FormEvent } from "react";

/**
 * Presentational form with client-side validation against the CONTRACT schema.
 *
 * The same Zod schema the server enforces is reused here, so the client cannot
 * disagree with the server about what is valid. This is a UX optimisation only —
 * the server still validates every request; client validation is never trusted.
 */
export interface TaskFormProps {
  readonly onSubmit: (title: string) => void;
  readonly submitting?: boolean;
  /** Server-provided field errors, e.g. from a 400 problem document. */
  readonly serverError?: string | undefined;
}

export function TaskForm({ onSubmit, submitting = false, serverError }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const result = CreateTaskSchema.safeParse({ title });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid title.");
      return;
    }

    setError(undefined);
    onSubmit(result.data.title);
    setTitle("");
  }

  const message = error ?? serverError;

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <label className="task-form__label" htmlFor="task-title">
        New task
      </label>

      <input
        id="task-title"
        name="title"
        value={title}
        maxLength={TASK_TITLE_MAX_LENGTH}
        disabled={submitting}
        onChange={(event) => setTitle(event.target.value)}
        aria-invalid={message !== undefined}
        aria-describedby={message === undefined ? undefined : "task-title-error"}
        placeholder="What needs doing?"
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Adding…" : "Add task"}
      </button>

      {message !== undefined && (
        <p id="task-title-error" role="alert" className="task-form__error">
          {message}
        </p>
      )}
    </form>
  );
}
