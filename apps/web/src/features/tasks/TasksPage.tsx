import type { Task } from "@kit/contracts";
import { ApiError } from "../../application/ports.ts";
import {
  useCreateTask,
  useDeleteTask,
  useTasks,
  useUpdateTask,
} from "../../application/tasks/use-tasks.ts";
import { TaskForm } from "../../ui/TaskForm.tsx";
import { TaskItem } from "../../ui/TaskItem.tsx";

/**
 * The Tasks feature — composes hooks (application) with components (ui).
 *
 * This is the only layer that knows both exist. Components below it stay
 * presentational; hooks above it stay transport-agnostic.
 */
export function TasksPage() {
  const tasks = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const mutating = createTask.isPending || updateTask.isPending || deleteTask.isPending;

  function handleToggle(task: Task): void {
    updateTask.mutate({ taskId: task.id, changes: { done: !task.done } });
  }

  return (
    <main className="tasks-page">
      <h1>Tasks</h1>

      <TaskForm
        onSubmit={(title) => createTask.mutate({ title })}
        submitting={createTask.isPending}
        serverError={toMessage(createTask.error)}
      />

      {tasks.isPending && <p role="status">Loading tasks…</p>}

      {tasks.isError && (
        <p role="alert" className="tasks-page__error">
          {toMessage(tasks.error) ?? "Could not load tasks."}
        </p>
      )}

      {tasks.isSuccess &&
        (tasks.data.items.length === 0 ? (
          <p data-testid="empty-state">No tasks yet. Add one above.</p>
        ) : (
          <>
            <ul className="tasks-page__list">
              {tasks.data.items.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDelete={(target) => deleteTask.mutate(target.id)}
                  busy={mutating}
                />
              ))}
            </ul>
            <p data-testid="task-total">
              {tasks.data.total} {tasks.data.total === 1 ? "task" : "tasks"}
            </p>
          </>
        ))}
    </main>
  );
}

/** Surfaces the server's problem detail when there is one, otherwise a generic message. */
function toMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    return error.fieldErrors[0]?.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return undefined;
}
