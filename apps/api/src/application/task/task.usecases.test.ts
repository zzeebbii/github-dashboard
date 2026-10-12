import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryTaskRepository,
  fixedClock,
  nthTaskId,
  sequentialIds,
} from "../../../tests/fakes/in-memory-task-repository.ts";
import { Task, type TaskId } from "../../domain/task/task.ts";
import type { TaskDependencies } from "./task.usecases.ts";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "./task.usecases.ts";

// Zero mocks: the repository is a real in-memory implementation of the port.

function makeTask(title: string, done = false, createdAt = "2026-01-01T00:00:00.000Z"): Task {
  const result = Task.create({
    id: `00000000-0000-4000-8000-${title.length.toString(16).padStart(12, "0")}` as TaskId,
    title,
    createdAt: new Date(createdAt),
  });
  if (!result.ok) throw new Error("fixture must be valid");
  return done ? result.value.markDone() : result.value;
}

let deps: TaskDependencies;

beforeEach(() => {
  deps = {
    tasks: new InMemoryTaskRepository(),
    clock: fixedClock(),
    ids: sequentialIds(),
  };
});

describe("createTask", () => {
  it("persists a new task and returns it", async () => {
    const result = await createTask(deps, { title: "Write the ADR" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Write the ADR");
    expect(result.value.done).toBe(false);
    expect(result.value.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));

    const stored = await deps.tasks.findById(result.value.id);
    expect(stored?.title).toBe("Write the ADR");
  });

  it("assigns deterministic ids from the injected generator", async () => {
    const first = await createTask(deps, { title: "One" });
    const second = await createTask(deps, { title: "Two" });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.id).toBe(nthTaskId(1));
    expect(second.value.id).toBe(nthTaskId(2));
  });

  it("returns a validation error and stores nothing when the title is empty", async () => {
    const result = await createTask(deps, { title: "  " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("Validation");

    const page = await listTasks(deps, { limit: 10, offset: 0 });
    expect(page.total).toBe(0);
  });
});

describe("getTask", () => {
  it("returns NotFound for an unknown id", async () => {
    const result = await getTask(deps, "ffffffff-0000-4000-8000-000000000000" as TaskId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: "NotFound",
      resource: "Task",
      id: "ffffffff-0000-4000-8000-000000000000",
    });
  });

  it("returns the task when it exists", async () => {
    const created = await createTask(deps, { title: "Findable" });
    if (!created.ok) throw new Error("setup failed");

    const found = await getTask(deps, created.value.id);

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.title).toBe("Findable");
  });
});

describe("listTasks", () => {
  beforeEach(() => {
    deps = {
      tasks: new InMemoryTaskRepository([
        makeTask("Oldest", false, "2026-01-01T00:00:00.000Z"),
        makeTask("Middle!", true, "2026-01-02T00:00:00.000Z"),
        makeTask("Newest!!", false, "2026-01-03T00:00:00.000Z"),
      ]),
      clock: fixedClock(),
      ids: sequentialIds(),
    };
  });

  it("returns newest first", async () => {
    const page = await listTasks(deps, { limit: 10, offset: 0 });

    expect(page.items.map((task) => task.title)).toEqual(["Newest!!", "Middle!", "Oldest"]);
    expect(page.total).toBe(3);
  });

  it("filters by done", async () => {
    const page = await listTasks(deps, { done: true, limit: 10, offset: 0 });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it("reports the unpaged total alongside a paged slice", async () => {
    const page = await listTasks(deps, { limit: 2, offset: 1 });

    expect(page.items.map((task) => task.title)).toEqual(["Middle!", "Oldest"]);
    expect(page.total).toBe(3);
  });
});

describe("updateTask", () => {
  it("renames a task while preserving done state", async () => {
    const created = await createTask(deps, { title: "Before" });
    if (!created.ok) throw new Error("setup failed");
    await updateTask(deps, created.value.id, { done: true });

    const result = await updateTask(deps, created.value.id, { title: "After" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("After");
    expect(result.value.done).toBe(true);
  });

  it("rejects an invalid rename without persisting it", async () => {
    const created = await createTask(deps, { title: "Keep me" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateTask(deps, created.value.id, { title: "" });

    expect(result.ok).toBe(false);
    const stored = await deps.tasks.findById(created.value.id);
    expect(stored?.title).toBe("Keep me");
  });

  it("returns NotFound for an unknown id", async () => {
    const result = await updateTask(deps, "ffffffff-0000-4000-8000-000000000000" as TaskId, {
      done: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NotFound");
  });
});

describe("deleteTask", () => {
  it("deletes an existing task", async () => {
    const created = await createTask(deps, { title: "Temporary" });
    if (!created.ok) throw new Error("setup failed");

    const result = await deleteTask(deps, created.value.id);

    expect(result.ok).toBe(true);
    expect(await deps.tasks.findById(created.value.id)).toBeUndefined();
  });

  it("returns NotFound when deleting an unknown id", async () => {
    const result = await deleteTask(deps, "ffffffff-0000-4000-8000-000000000000" as TaskId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NotFound");
  });
});
