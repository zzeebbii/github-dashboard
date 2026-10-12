import type { Task, TaskId } from "../domain/task/task.ts";

/**
 * PORTS — the interfaces the application layer needs from the outside world.
 *
 * The application DEFINES these; infrastructure IMPLEMENTS them; the composition
 * root WIRES them. That inversion is what lets the domain be tested with zero
 * mocks and what makes Postgres, the clock, and id generation replaceable.
 *
 * Ports are expressed in domain terms — no rows, no SQL, no HTTP.
 */

export interface TaskFilter {
  readonly done?: boolean | undefined;
  readonly limit: number;
  readonly offset: number;
}

export interface TaskPage {
  readonly items: readonly Task[];
  readonly total: number;
}

export interface TaskRepository {
  findById(id: TaskId): Promise<Task | undefined>;
  findMany(filter: TaskFilter): Promise<TaskPage>;
  save(task: Task): Promise<void>;
  delete(id: TaskId): Promise<boolean>;
}

/** Injected so tests never depend on the real clock. */
export interface Clock {
  now(): Date;
}

/** Injected so tests get deterministic ids and assertions can name them. */
export interface IdGenerator {
  nextTaskId(): TaskId;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
