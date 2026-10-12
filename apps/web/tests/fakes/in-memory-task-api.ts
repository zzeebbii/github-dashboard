import type { CreateTask, Task, TaskList, UpdateTask } from "@kit/contracts";
import { aTask } from "@kit/testing";
import { ApiError, type TaskApi } from "../../src/application/ports.ts";

/**
 * An in-memory implementation of the TaskApi port.
 *
 * Component tests use this instead of MSW or `vi.mock`: it is real code with real
 * behaviour, so the component under test exercises the same call sequence it will
 * in production. MSW is reserved for verifying the HTTP ADAPTER itself, where the
 * wire format is the thing being tested.
 */
export class InMemoryTaskApi implements TaskApi {
  private readonly store = new Map<string, Task>();
  private counter = 0;

  /** Set to make the next call reject, for exercising error states. */
  failNextWith: ApiError | undefined = undefined;

  constructor(seed: readonly Task[] = []) {
    for (const task of seed) {
      this.store.set(task.id, task);
    }
  }

  private guard(): void {
    if (this.failNextWith !== undefined) {
      const error = this.failNextWith;
      this.failNextWith = undefined;
      throw error;
    }
  }

  list(query: { done?: boolean | undefined }): Promise<TaskList> {
    this.guard();
    const items = [...this.store.values()]
      .filter((task) => (query.done === undefined ? true : task.done === query.done))
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Promise.resolve({ items, total: items.length });
  }

  create(input: CreateTask): Promise<Task> {
    this.guard();
    this.counter += 1;
    // Built through the shared factory, which validates against the contract —
    // so a fake response can never be a shape the real API could not return.
    const task = aTask({
      title: input.title,
      done: false,
      createdAt: new Date(Date.UTC(2026, 0, this.counter)).toISOString(),
    });
    this.store.set(task.id, task);
    return Promise.resolve(task);
  }

  update(taskId: string, changes: UpdateTask): Promise<Task> {
    this.guard();
    const existing = this.store.get(taskId);
    if (existing === undefined) {
      return Promise.reject(new ApiError("Task not found", 404));
    }

    const updated: Task = {
      ...existing,
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.done === undefined ? {} : { done: changes.done }),
    };
    this.store.set(taskId, updated);
    return Promise.resolve(updated);
  }

  remove(taskId: string): Promise<void> {
    this.guard();
    return this.store.delete(taskId)
      ? Promise.resolve()
      : Promise.reject(new ApiError("Task not found", 404));
  }
}
