import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DrizzleTaskRepository } from "../../src/infrastructure/persistence/drizzle-task-repository.ts";
import { Task, toTaskId } from "../../src/domain/task/task.ts";
import { startTestDatabase, type TestDatabase } from "./setup-database.ts";

/**
 * Verifies the Drizzle adapter against REAL PostgreSQL.
 *
 * The use-case tests already cover behaviour using the in-memory fake. What is
 * tested here is only what a fake cannot tell us: that the SQL is correct, that
 * the migration produces a usable schema, that timestamps survive a round trip
 * with their timezone intact, and that upsert semantics behave as intended.
 */

let database: TestDatabase;
let repository: DrizzleTaskRepository;

beforeAll(async () => {
  database = await startTestDatabase();
  repository = new DrizzleTaskRepository(database.db);
});

afterAll(async () => {
  await database.stop();
});

afterEach(async () => {
  await database.truncate();
});

function makeTask(title: string, id: string, createdAt: string): Task {
  const result = Task.create({ id: toTaskId(id), title, createdAt: new Date(createdAt) });
  if (!result.ok) throw new Error("fixture must be valid");
  return result.value;
}

const idA = "00000000-0000-4000-8000-00000000000a";
const idB = "00000000-0000-4000-8000-00000000000b";
const idC = "00000000-0000-4000-8000-00000000000c";

describe("DrizzleTaskRepository", () => {
  it("round-trips a task, preserving the exact timestamp", async () => {
    const createdAt = "2026-03-04T05:06:07.008Z";
    await repository.save(makeTask("Round trip", idA, createdAt));

    const found = await repository.findById(toTaskId(idA));

    expect(found?.title).toBe("Round trip");
    expect(found?.done).toBe(false);
    // A naive `timestamp without time zone` column silently shifts this.
    expect(found?.createdAt.toISOString()).toBe(createdAt);
  });

  it("returns undefined for an unknown id rather than throwing", async () => {
    expect(await repository.findById(toTaskId(idA))).toBeUndefined();
  });

  it("upserts on save rather than raising a duplicate-key error", async () => {
    const task = makeTask("Original", idA, "2026-01-01T00:00:00.000Z");
    await repository.save(task);

    await repository.save(task.markDone());

    const found = await repository.findById(toTaskId(idA));
    expect(found?.done).toBe(true);

    const page = await repository.findMany({ limit: 10, offset: 0 });
    expect(page.total).toBe(1);
  });

  it("orders by createdAt descending", async () => {
    await repository.save(makeTask("Oldest", idA, "2026-01-01T00:00:00.000Z"));
    await repository.save(makeTask("Newest", idC, "2026-01-03T00:00:00.000Z"));
    await repository.save(makeTask("Middle", idB, "2026-01-02T00:00:00.000Z"));

    const page = await repository.findMany({ limit: 10, offset: 0 });

    expect(page.items.map((task) => task.title)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("reports the UNPAGED total alongside a paged slice", async () => {
    await repository.save(makeTask("One", idA, "2026-01-01T00:00:00.000Z"));
    await repository.save(makeTask("Two", idB, "2026-01-02T00:00:00.000Z"));
    await repository.save(makeTask("Three", idC, "2026-01-03T00:00:00.000Z"));

    const page = await repository.findMany({ limit: 1, offset: 1 });

    expect(page.items.map((task) => task.title)).toEqual(["Two"]);
    // A common bug: returning items.length here instead of the real count.
    expect(page.total).toBe(3);
  });

  it("applies the done filter to BOTH the page and the total", async () => {
    await repository.save(makeTask("Open", idA, "2026-01-01T00:00:00.000Z"));
    await repository.save(makeTask("Closed", idB, "2026-01-02T00:00:00.000Z").markDone());

    const done = await repository.findMany({ done: true, limit: 10, offset: 0 });
    const open = await repository.findMany({ done: false, limit: 10, offset: 0 });

    expect(done.items.map((task) => task.title)).toEqual(["Closed"]);
    expect(done.total).toBe(1);
    expect(open.items.map((task) => task.title)).toEqual(["Open"]);
    expect(open.total).toBe(1);
  });

  it("deletes and reports whether a row was removed", async () => {
    await repository.save(makeTask("Temporary", idA, "2026-01-01T00:00:00.000Z"));

    expect(await repository.delete(toTaskId(idA))).toBe(true);
    expect(await repository.delete(toTaskId(idA))).toBe(false);
    expect(await repository.findById(toTaskId(idA))).toBeUndefined();
  });

  it("stores a title at the maximum contract length", async () => {
    const title = "x".repeat(200);
    await repository.save(makeTask(title, idA, "2026-01-01T00:00:00.000Z"));

    expect((await repository.findById(toTaskId(idA)))?.title).toHaveLength(200);
  });
});
