import type { CreateTask, Task, TaskList, UpdateTask } from "@kit/contracts";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useTaskApi } from "../api-provider.tsx";

/**
 * Server-state hooks for the Task slice.
 *
 * All cache keys live in `taskKeys` so invalidation is impossible to typo — the
 * most common source of "why didn't the list refresh?" bugs. Hooks depend on the
 * TaskApi PORT, so they are testable against an in-memory fake.
 */

export interface TaskListFilters {
  readonly done?: boolean | undefined;
}

const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters: TaskListFilters) => [...taskKeys.lists(), filters] as const,
};

export function useTasks(filters: TaskListFilters = {}): UseQueryResult<TaskList> {
  const api = useTaskApi();

  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => api.list({ done: filters.done }),
  });
}

export function useCreateTask(): UseMutationResult<Task, Error, CreateTask> {
  const api = useTaskApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTask) => api.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}

export function useUpdateTask(): UseMutationResult<
  Task,
  Error,
  { taskId: string; changes: UpdateTask }
> {
  const api = useTaskApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, changes }: { taskId: string; changes: UpdateTask }) =>
      api.update(taskId, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}

export function useDeleteTask(): UseMutationResult<void, Error, string> {
  const api = useTaskApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.remove(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}
