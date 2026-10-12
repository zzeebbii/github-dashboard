/**
 * The Task domain model.
 *
 * This file has ZERO imports. That is enforced by dependency-cruiser
 * (`domain-is-pure`) and by oxlint, and it is the reason the business rules
 * below survive a change of framework, ORM, or runtime.
 *
 * Invariants are enforced by construction: `Task.create` is the only way to
 * build one, and it returns a Result rather than throwing. An invalid Task is
 * therefore unrepresentable — we do not validate a Task after the fact, because
 * there is no way to have made an invalid one.
 */

export const TASK_TITLE_MAX_LENGTH = 200;

/** Branded so a bare string cannot be passed where a TaskId is required. */
export type TaskId = string & { readonly __brand: "TaskId" };

/**
 * The ONE sanctioned place to brand a string as a TaskId.
 *
 * Branding requires an assertion somewhere; concentrating it here means the rest
 * of the codebase never casts, and every entry point into the type is greppable.
 * Callers are responsible for having validated the value at a boundary first —
 * which the contract's `z.uuid()` does for every inbound request.
 */
export function toTaskId(value: string): TaskId {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason: the single, documented brand-construction site
  return value as TaskId;
}

export type TaskValidationError =
  | { readonly kind: "TitleEmpty" }
  | { readonly kind: "TitleTooLong"; readonly maxLength: number; readonly actualLength: number };

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}

export interface TaskSnapshot {
  readonly id: TaskId;
  readonly title: string;
  readonly done: boolean;
  readonly createdAt: Date;
}

export class Task {
  readonly id: TaskId;
  readonly title: string;
  readonly done: boolean;
  readonly createdAt: Date;

  /** Private-by-convention: use `Task.create` or `Task.restore`. */
  private constructor(snapshot: TaskSnapshot) {
    this.id = snapshot.id;
    this.title = snapshot.title;
    this.done = snapshot.done;
    this.createdAt = snapshot.createdAt;
  }

  /** Creates a new Task, enforcing every invariant. */
  static create(input: {
    id: TaskId;
    title: string;
    createdAt: Date;
  }): Result<Task, TaskValidationError> {
    const title = input.title.trim();

    if (title.length === 0) {
      return err({ kind: "TitleEmpty" });
    }
    if (title.length > TASK_TITLE_MAX_LENGTH) {
      return err({
        kind: "TitleTooLong",
        maxLength: TASK_TITLE_MAX_LENGTH,
        actualLength: title.length,
      });
    }

    return ok(new Task({ id: input.id, title, done: false, createdAt: input.createdAt }));
  }

  /**
   * Rehydrates a Task from storage. Persisted data is trusted to have been
   * validated when it was created; re-running creation rules here would make
   * historical rows unloadable whenever a rule tightens.
   */
  static restore(snapshot: TaskSnapshot): Task {
    return new Task(snapshot);
  }

  rename(title: string): Result<Task, TaskValidationError> {
    const created = Task.create({ id: this.id, title, createdAt: this.createdAt });
    if (!created.ok) {
      return created;
    }
    return ok(Task.restore({ ...created.value.toSnapshot(), done: this.done }));
  }

  markDone(): Task {
    return this.done ? this : Task.restore({ ...this.toSnapshot(), done: true });
  }

  markNotDone(): Task {
    return this.done ? Task.restore({ ...this.toSnapshot(), done: false }) : this;
  }

  toSnapshot(): TaskSnapshot {
    return { id: this.id, title: this.title, done: this.done, createdAt: this.createdAt };
  }
}
