import type { CreateTask, Task, TaskList, UpdateTask } from "@kit/contracts";

/**
 * The frontend's port to the backend.
 *
 * Features and hooks depend on THIS interface, never on `fetch` or on a concrete
 * client. That inversion is what lets component tests run against an in-memory
 * implementation with no network and no MSW, and what makes the transport
 * (fetch, an SDK, a mock) swappable without touching a single component.
 *
 * Types come from @kit/contracts, so this port cannot drift from the API.
 */
export interface TaskApi {
  list(query: { done?: boolean | undefined; limit?: number; offset?: number }): Promise<TaskList>;
  create(input: CreateTask): Promise<Task>;
  update(taskId: string, changes: UpdateTask): Promise<Task>;
  remove(taskId: string): Promise<void>;
}

/** Transport-agnostic error surfaced to the UI. Mirrors RFC 9457 without leaking HTTP details. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: readonly { pointer: string; message: string }[];

  constructor(
    message: string,
    status: number,
    fieldErrors: readonly { pointer: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}
