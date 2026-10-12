import { TaskSchema, type CreateTask, type Task } from "@kit/contracts";

/**
 * Factories return values typed by the CONTRACT, so a fixture that drifts from
 * the API shape fails to compile rather than failing mysteriously at runtime.
 *
 * Each factory validates its output against the contract schema. That means a
 * malformed fixture is caught in the test that builds it, not three layers away.
 */

let taskCounter = 0;

export function aTask(overrides: Partial<Task> = {}): Task {
  taskCounter += 1;
  const task: Task = {
    id: `00000000-0000-4000-8000-${taskCounter.toString(16).padStart(12, "0")}`,
    title: `Task ${taskCounter}`,
    done: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  // Fail loudly at construction if a fixture violates the contract.
  return TaskSchema.parse(task);
}

export function aCreateTask(overrides: Partial<CreateTask> = {}): CreateTask {
  return { title: "A new task", ...overrides };
}

/** Resets factory counters so ids are stable across independent test files. */
export function resetFactories(): void {
  taskCounter = 0;
}
