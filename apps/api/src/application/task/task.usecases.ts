import { Task, err, ok, type Result, type TaskId } from "../../domain/task/task.ts";
import { fromTaskValidationError, notFound, type AppError } from "../errors.ts";
import type { Clock, IdGenerator, TaskFilter, TaskPage, TaskRepository } from "../ports.ts";

/**
 * Use cases for the Task slice.
 *
 * Each is a plain function taking its dependencies explicitly. No decorators, no
 * container, no framework — which means each is callable from a test in one line
 * and could be driven by an HTTP route, a CLI, or a queue consumer unchanged.
 */

export interface TaskDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export async function listTasks(deps: TaskDependencies, filter: TaskFilter): Promise<TaskPage> {
  return deps.tasks.findMany(filter);
}

export async function getTask(deps: TaskDependencies, id: TaskId): Promise<Result<Task, AppError>> {
  const task = await deps.tasks.findById(id);
  return task === undefined ? err(notFound("Task", id)) : ok(task);
}

export async function createTask(
  deps: TaskDependencies,
  input: { title: string },
): Promise<Result<Task, AppError>> {
  const created = Task.create({
    id: deps.ids.nextTaskId(),
    title: input.title,
    createdAt: deps.clock.now(),
  });

  if (!created.ok) {
    return err(fromTaskValidationError(created.error));
  }

  await deps.tasks.save(created.value);
  return ok(created.value);
}

export async function updateTask(
  deps: TaskDependencies,
  id: TaskId,
  changes: { title?: string | undefined; done?: boolean | undefined },
): Promise<Result<Task, AppError>> {
  const existing = await deps.tasks.findById(id);
  if (existing === undefined) {
    return err(notFound("Task", id));
  }

  let updated = existing;

  if (changes.title !== undefined) {
    const renamed = updated.rename(changes.title);
    if (!renamed.ok) {
      return err(fromTaskValidationError(renamed.error));
    }
    updated = renamed.value;
  }

  if (changes.done !== undefined) {
    updated = changes.done ? updated.markDone() : updated.markNotDone();
  }

  await deps.tasks.save(updated);
  return ok(updated);
}

export async function deleteTask(
  deps: TaskDependencies,
  id: TaskId,
): Promise<Result<undefined, AppError>> {
  const deleted = await deps.tasks.delete(id);
  return deleted ? ok(undefined) : err(notFound("Task", id));
}
