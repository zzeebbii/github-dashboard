import { describe, expect, it } from "vitest";
import { buildPath } from "../endpoint.ts";
import { getTask } from "./task.endpoints.ts";
import {
  CreateTaskSchema,
  ListTasksQuerySchema,
  TaskSchema,
  UpdateTaskSchema,
} from "./task.schema.ts";

const validTask = {
  id: "2f1c8b6e-0f5a-4d3b-9c1a-7e5d2b8a4f10",
  title: "Write the ADR",
  done: false,
  createdAt: "2026-08-15T10:00:00.000Z",
};

describe("TaskSchema", () => {
  it("accepts a valid task", () => {
    expect(TaskSchema.safeParse(validTask).success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    expect(TaskSchema.safeParse({ ...validTask, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-RFC-3339 createdAt", () => {
    expect(TaskSchema.safeParse({ ...validTask, createdAt: "15/08/2026" }).success).toBe(false);
  });
});

describe("CreateTaskSchema", () => {
  it.each([
    ["empty title", ""],
    ["title over the limit", "x".repeat(201)],
  ])("rejects %s", (_name, title) => {
    expect(CreateTaskSchema.safeParse({ title }).success).toBe(false);
  });

  it("accepts a title at exactly the limit", () => {
    expect(CreateTaskSchema.safeParse({ title: "x".repeat(200) }).success).toBe(true);
  });
});

describe("UpdateTaskSchema", () => {
  it("rejects an empty patch", () => {
    expect(UpdateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial patch", () => {
    expect(UpdateTaskSchema.safeParse({ done: true }).success).toBe(true);
  });
});

describe("ListTasksQuerySchema", () => {
  it("applies defaults when the query is empty", () => {
    const result = ListTasksQuerySchema.parse({});
    expect(result).toEqual({ done: undefined, limit: 20, offset: 0 });
  });

  it("coerces string query params to their typed form", () => {
    const result = ListTasksQuerySchema.parse({ done: "true", limit: "5", offset: "10" });
    expect(result).toEqual({ done: true, limit: 5, offset: 10 });
  });

  it("rejects a limit above the maximum", () => {
    expect(ListTasksQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("buildPath", () => {
  it("substitutes path parameters", () => {
    expect(buildPath(getTask.path, { taskId: validTask.id })).toBe(`/api/tasks/${validTask.id}`);
  });

  it("throws when a parameter is missing rather than emitting a malformed URL", () => {
    expect(() => buildPath(getTask.path, {})).toThrow('Missing path parameter "taskId"');
  });

  it("URL-encodes parameter values", () => {
    expect(buildPath("/api/tasks/:taskId", { taskId: "a/b" })).toBe("/api/tasks/a%2Fb");
  });
});
