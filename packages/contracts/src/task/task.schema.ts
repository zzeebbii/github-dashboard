import { z } from "zod";

/**
 * The Task resource — the reference vertical slice.
 *
 * These schemas are the source of truth for the wire format. They are consumed
 * by the backend (request/response validation), the frontend (typed client and
 * response validation), and the OpenAPI generator. Changing an existing field
 * here is a breaking API change; CI will detect it.
 */

export const TASK_TITLE_MAX_LENGTH = 200;

export const TaskIdSchema = z.uuid().describe("Unique identifier of the task.");

export const TaskSchema = z.object({
  id: TaskIdSchema,
  title: z.string().min(1).max(TASK_TITLE_MAX_LENGTH),
  done: z.boolean(),
  createdAt: z.iso.datetime().describe("RFC 3339 timestamp, always UTC."),
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(TASK_TITLE_MAX_LENGTH),
});

export const UpdateTaskSchema = z
  .object({
    title: z.string().min(1).max(TASK_TITLE_MAX_LENGTH).optional(),
    done: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.done !== undefined, {
    message: 'At least one of "title" or "done" must be provided.',
  });

export const TaskListSchema = z.object({
  items: z.array(TaskSchema),
  total: z.int().min(0),
});

export const ListTasksQuerySchema = z.object({
  /** Query params arrive as strings; coerce so the contract is usable directly. */
  done: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const TaskParamsSchema = z.object({
  taskId: TaskIdSchema,
});

export type Task = z.infer<typeof TaskSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type TaskList = z.infer<typeof TaskListSchema>;
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
export type TaskParams = z.infer<typeof TaskParamsSchema>;
