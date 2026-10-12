import { nthUuid, sequentialUuids, fixedClock as sharedFixedClock } from "@kit/testing";
import type {
  Clock,
  IdGenerator,
  TaskFilter,
  TaskPage,
  TaskRepository,
} from "../../src/application/ports.ts";
import { toTaskId, type Task, type TaskId } from "../../src/domain/task/task.ts";

/**
 * The canonical example of a port fake.
 *
 * Use cases are tested against THIS, not against `vi.mock`. It is real code with
 * real behaviour, so a test that passes here exercises the same call sequence the
 * Drizzle adapter will see. The Drizzle adapter is then verified separately
 * against real Postgres in tests/integration.
 *
 * If you find yourself wanting `vi.mock` for an internal module, you are missing
 * a port — add one instead. See docs/guides/testing.md.
 */
export class InMemoryTaskRepository implements TaskRepository {
  private readonly store = new Map<TaskId, Task>();

  constructor(seed: readonly Task[] = []) {
    for (const task of seed) {
      this.store.set(task.id, task);
    }
  }

  findById(id: TaskId): Promise<Task | undefined> {
    return Promise.resolve(this.store.get(id));
  }

  findMany(filter: TaskFilter): Promise<TaskPage> {
    const all = [...this.store.values()]
      .filter((task) => (filter.done === undefined ? true : task.done === filter.done))
      .toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return Promise.resolve({
      items: all.slice(filter.offset, filter.offset + filter.limit),
      total: all.length,
    });
  }

  save(task: Task): Promise<void> {
    this.store.set(task.id, task);
    return Promise.resolve();
  }

  delete(id: TaskId): Promise<boolean> {
    return Promise.resolve(this.store.delete(id));
  }
}

/** A clock frozen at a fixed instant. Shared with the frontend via @kit/testing. */
export function fixedClock(iso?: string): Clock {
  return sharedFixedClock(iso);
}

/** Deterministic, valid TaskIds so assertions can name exact ids. */
export function sequentialIds(): IdGenerator {
  const uuids = sequentialUuids();
  return { nextTaskId: () => toTaskId(uuids.next()) };
}

/** The nth id `sequentialIds` will produce — for writing expected values. */
export function nthTaskId(n: number): TaskId {
  return toTaskId(nthUuid(n));
}
