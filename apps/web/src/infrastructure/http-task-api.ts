import {
  ProblemSchema,
  TaskListSchema,
  TaskSchema,
  buildPath,
  createTask as createTaskContract,
  deleteTask as deleteTaskContract,
  listTasks as listTasksContract,
  updateTask as updateTaskContract,
  type CreateTask,
  type Task,
  type TaskList,
  type UpdateTask,
} from "@kit/contracts";
import type { z } from "zod";
import { ApiError, type TaskApi } from "../application/ports.ts";

/**
 * The HTTP adapter for the TaskApi port — the ONLY file in the frontend that
 * performs network I/O.
 *
 * Every response is parsed against the contract schema before it reaches the
 * application. TypeScript types vanish at runtime, so without this the app would
 * happily hand malformed server data to components and fail somewhere far away
 * from the cause. Here, a contract violation fails loudly at the boundary.
 *
 * Paths and methods come from the contract, so a URL can never drift from the
 * published OpenAPI document.
 */

export interface HttpTaskApiOptions {
  readonly baseUrl: string;
  /** Injected so tests can supply a stub without patching globals. */
  readonly fetchImpl?: typeof fetch;
}

/** Turns a non-2xx response into an ApiError, tolerating non-problem bodies. */
async function toApiError(response: Response): Promise<ApiError> {
  // The API always returns RFC 9457 problems, but a proxy or gateway might not,
  // so fall back rather than throwing while building the error.
  const body: unknown = await response.json().catch(() => undefined);
  const problem = ProblemSchema.safeParse(body);

  return problem.success
    ? new ApiError(problem.data.detail, problem.data.status, problem.data.errors ?? [])
    : new ApiError(`Request failed with status ${response.status}`, response.status);
}

/** Parses a response body against the contract, failing loudly on drift. */
async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ApiError(
      "The server returned a response that does not match the API contract.",
      response.status,
    );
  }
  return result.data;
}

export function createHttpTaskApi(options: HttpTaskApiOptions): TaskApi {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = options.baseUrl.replace(/\/$/, "");

  async function request(path: string, init: RequestInit): Promise<Response> {
    // HeadersInit may be a plain object, a Headers instance, or an array of
    // tuples. Object-spreading the latter two silently produces garbage, so
    // merge through Headers, which normalises all three.
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await doFetch(`${base}${path}`, { ...init, headers });

    if (!response.ok) {
      throw await toApiError(response);
    }
    return response;
  }

  return {
    async list(query): Promise<TaskList> {
      const params = new URLSearchParams();
      if (query.done !== undefined) params.set("done", String(query.done));
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      if (query.offset !== undefined) params.set("offset", String(query.offset));

      const search = params.size > 0 ? `?${params.toString()}` : "";
      const response = await request(`${listTasksContract.path}${search}`, { method: "GET" });
      return parse(response, TaskListSchema);
    },

    async create(input: CreateTask): Promise<Task> {
      const response = await request(createTaskContract.path, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return parse(response, TaskSchema);
    },

    async update(taskId: string, changes: UpdateTask): Promise<Task> {
      const response = await request(buildPath(updateTaskContract.path, { taskId }), {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      return parse(response, TaskSchema);
    },

    async remove(taskId: string): Promise<void> {
      await request(buildPath(deleteTaskContract.path, { taskId }), { method: "DELETE" });
    },
  };
}
