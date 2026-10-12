import type { Task } from "@kit/contracts";

/**
 * Presentational only: no data fetching, no hooks beyond rendering.
 * Everything arrives via props, so this renders in a test with zero setup.
 */
export interface TaskItemProps {
  readonly task: Task;
  readonly onToggle: (task: Task) => void;
  readonly onDelete: (task: Task) => void;
  readonly busy?: boolean;
}

export function TaskItem({ task, onToggle, onDelete, busy = false }: TaskItemProps) {
  return (
    <li className="task-item" data-testid="task-item" data-done={task.done}>
      <label className="task-item__label">
        <input
          type="checkbox"
          checked={task.done}
          disabled={busy}
          onChange={() => onToggle(task)}
          aria-label={`Mark "${task.title}" as ${task.done ? "not done" : "done"}`}
        />
        <span
          className={task.done ? "task-item__title task-item__title--done" : "task-item__title"}
        >
          {task.title}
        </span>
      </label>

      <button
        type="button"
        className="task-item__delete"
        disabled={busy}
        onClick={() => onDelete(task)}
        aria-label={`Delete "${task.title}"`}
      >
        Delete
      </button>
    </li>
  );
}
