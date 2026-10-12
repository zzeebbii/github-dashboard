import {
  CreateTaskSchema,
  ListTasksQuerySchema,
  TaskParamsSchema,
  UpdateTaskSchema,
  createTask as createTaskContract,
  deleteTask as deleteTaskContract,
  getTask as getTaskContract,
  listTasks as listTasksContract,
  updateTask as updateTaskContract,
} from "@kit/contracts";
import { Hono } from "hono";
import type { Context } from "hono";
import type { ZodType, z } from "zod";
import type { TaskDependencies } from "../application/task/task.usecases.ts";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../application/task/task.usecases.ts";
import { toTaskId, type Task } from "../domain/task/task.ts";
import { toProblem, validationProblem, type ProblemResponse } from "./problem.ts";

/**
 * The Hono adapter for the Task slice.
 *
 * Routes are thin: parse against the CONTRACT, call a use case, map the result.
 * No business logic lives here — if a rule appears in this file, it is in the
 * wrong layer. Paths come from the contract, so a route can never drift from the
 * published OpenAPI document.
 */

/** Converts Zod issues into contract-shaped validation issues (JSON Pointers). */
function toIssues(error: z.ZodError): { pointer: string; message: string }[] {
  return error.issues.map((issue) => ({
    pointer: `/${issue.path.join("/")}`,
    message: issue.message,
  }));
}

/** Serialises a domain Task into its contract representation. */
function toContract(task: Task) {
  const snapshot = task.toSnapshot();
  return {
    id: snapshot.id,
    title: snapshot.title,
    done: snapshot.done,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

function sendProblem(c: Context, problem: ProblemResponse): Response {
  // No cast needed: ProblemStatus is a union of exactly the statuses we emit.
  return c.json(problem.body, problem.status);
}

function parse<T extends ZodType>(schema: T, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({ ok: false, problem: validationProblem(toIssues(parsed.error)) } as const);
}

/** Reads a JSON body, treating malformed JSON as absent so Zod reports it. */
async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createTaskRoutes(deps: TaskDependencies): Hono {
  const routes = new Hono();

  routes.get(listTasksContract.path, async (c) => {
    const query = parse(ListTasksQuerySchema, c.req.query());
    if (!query.ok) return sendProblem(c, query.problem);

    const page = await listTasks(deps, {
      done: query.data.done,
      limit: query.data.limit,
      offset: query.data.offset,
    });

    return c.json({ items: page.items.map(toContract), total: page.total }, 200);
  });

  routes.post(createTaskContract.path, async (c) => {
    const body = parse(CreateTaskSchema, await readJson(c));
    if (!body.ok) return sendProblem(c, body.problem);

    const result = await createTask(deps, { title: body.data.title });
    if (!result.ok) return sendProblem(c, toProblem(result.error, c.req.path));

    return c.json(toContract(result.value), 201);
  });

  routes.get(getTaskContract.path, async (c) => {
    const params = parse(TaskParamsSchema, c.req.param());
    if (!params.ok) return sendProblem(c, params.problem);

    const result = await getTask(deps, toTaskId(params.data.taskId));
    if (!result.ok) return sendProblem(c, toProblem(result.error, c.req.path));

    return c.json(toContract(result.value), 200);
  });

  routes.patch(updateTaskContract.path, async (c) => {
    const params = parse(TaskParamsSchema, c.req.param());
    if (!params.ok) return sendProblem(c, params.problem);

    const body = parse(UpdateTaskSchema, await readJson(c));
    if (!body.ok) return sendProblem(c, body.problem);

    const result = await updateTask(deps, toTaskId(params.data.taskId), {
      title: body.data.title,
      done: body.data.done,
    });
    if (!result.ok) return sendProblem(c, toProblem(result.error, c.req.path));

    return c.json(toContract(result.value), 200);
  });

  routes.delete(deleteTaskContract.path, async (c) => {
    const params = parse(TaskParamsSchema, c.req.param());
    if (!params.ok) return sendProblem(c, params.problem);

    const result = await deleteTask(deps, toTaskId(params.data.taskId));
    if (!result.ok) return sendProblem(c, toProblem(result.error, c.req.path));

    return c.body(null, 204);
  });

  return routes;
}
