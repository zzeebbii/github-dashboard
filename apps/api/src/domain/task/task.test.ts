import { describe, expect, it } from "vitest";
import { TASK_TITLE_MAX_LENGTH, Task, type TaskId } from "./task.ts";

// Note: zero mocks, zero I/O, zero setup. If a domain test ever needs a mock,
// the dependency belongs behind a port instead. See docs/guides/testing.md.

const id = "a2f1c8b6-0f5a-4d3b-9c1a-7e5d2b8a4f10" as TaskId;
const createdAt = new Date("2026-01-01T00:00:00.000Z");

describe("Task.create", () => {
  it("creates a task that is not done", () => {
    const result = Task.create({ id, title: "Write the ADR", createdAt });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Write the ADR");
    expect(result.value.done).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const result = Task.create({ id, title: "  padded  ", createdAt });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("padded");
  });

  it("rejects a title that is empty after trimming", () => {
    const result = Task.create({ id, title: "   ", createdAt });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("TitleEmpty");
  });

  it("rejects a title over the maximum length", () => {
    const result = Task.create({ id, title: "x".repeat(TASK_TITLE_MAX_LENGTH + 1), createdAt });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      kind: "TitleTooLong",
      maxLength: TASK_TITLE_MAX_LENGTH,
      actualLength: TASK_TITLE_MAX_LENGTH + 1,
    });
  });

  it("accepts a title at exactly the maximum length", () => {
    const result = Task.create({ id, title: "x".repeat(TASK_TITLE_MAX_LENGTH), createdAt });

    expect(result.ok).toBe(true);
  });
});

describe("Task state transitions", () => {
  const task = (() => {
    const result = Task.create({ id, title: "Write the ADR", createdAt });
    if (!result.ok) throw new Error("fixture must be valid");
    return result.value;
  })();

  it("markDone produces a done task without mutating the original", () => {
    const done = task.markDone();

    expect(done.done).toBe(true);
    expect(task.done).toBe(false);
  });

  it("markDone is idempotent and returns the same instance", () => {
    const done = task.markDone();

    expect(done.markDone()).toBe(done);
  });

  it("markNotDone reverses markDone", () => {
    expect(task.markDone().markNotDone().done).toBe(false);
  });

  it("rename preserves done state and id", () => {
    const renamed = task.markDone().rename("New title");

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.title).toBe("New title");
    expect(renamed.value.done).toBe(true);
    expect(renamed.value.id).toBe(id);
  });

  it("rename enforces the same invariants as create", () => {
    const renamed = task.rename("");

    expect(renamed.ok).toBe(false);
    if (renamed.ok) return;
    expect(renamed.error.kind).toBe("TitleEmpty");
  });
});

describe("Task.restore", () => {
  it("rehydrates persisted state verbatim, without re-running creation rules", () => {
    // A row written before the length rule tightened must still load.
    const legacy = Task.restore({
      id,
      title: "x".repeat(TASK_TITLE_MAX_LENGTH + 50),
      done: true,
      createdAt,
    });

    expect(legacy.title).toHaveLength(TASK_TITLE_MAX_LENGTH + 50);
    expect(legacy.done).toBe(true);
  });
});
