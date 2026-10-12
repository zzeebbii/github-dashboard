import { defineEndpoint } from "../endpoint.ts";
import { ProblemSchema } from "../problem.ts";
import {
  CreateTaskSchema,
  ListTasksQuerySchema,
  TaskListSchema,
  TaskParamsSchema,
  TaskSchema,
  UpdateTaskSchema,
} from "./task.schema.ts";

export const listTasks = defineEndpoint({
  operationId: "listTasks",
  method: "get",
  path: "/api/tasks",
  summary: "List tasks",
  tags: ["tasks"],
  params: undefined,
  query: ListTasksQuerySchema,
  body: undefined,
  responses: {
    200: TaskListSchema,
    400: ProblemSchema,
  },
  successStatus: 200,
});

export const createTask = defineEndpoint({
  operationId: "createTask",
  method: "post",
  path: "/api/tasks",
  summary: "Create a task",
  tags: ["tasks"],
  params: undefined,
  query: undefined,
  body: CreateTaskSchema,
  responses: {
    201: TaskSchema,
    400: ProblemSchema,
  },
  successStatus: 201,
});

export const getTask = defineEndpoint({
  operationId: "getTask",
  method: "get",
  path: "/api/tasks/:taskId",
  summary: "Get a task by id",
  tags: ["tasks"],
  params: TaskParamsSchema,
  query: undefined,
  body: undefined,
  responses: {
    200: TaskSchema,
    404: ProblemSchema,
  },
  successStatus: 200,
});

export const updateTask = defineEndpoint({
  operationId: "updateTask",
  method: "patch",
  path: "/api/tasks/:taskId",
  summary: "Update a task",
  tags: ["tasks"],
  params: TaskParamsSchema,
  query: undefined,
  body: UpdateTaskSchema,
  responses: {
    200: TaskSchema,
    400: ProblemSchema,
    404: ProblemSchema,
  },
  successStatus: 200,
});

export const deleteTask = defineEndpoint({
  operationId: "deleteTask",
  method: "delete",
  path: "/api/tasks/:taskId",
  summary: "Delete a task",
  tags: ["tasks"],
  params: TaskParamsSchema,
  query: undefined,
  body: undefined,
  responses: {
    204: TaskSchema.optional(),
    404: ProblemSchema,
  },
  successStatus: 204,
});

export const taskEndpoints = {
  listTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
} as const;
