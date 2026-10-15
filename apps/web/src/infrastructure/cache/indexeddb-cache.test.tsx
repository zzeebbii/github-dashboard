// `.tsx` only so this runs in the Chromium "component" project: IndexedDB needs a real
// browser, and the jsdom "unit" project owns `*.test.ts`. No JSX here.
import { afterEach, expect, test } from "vitest";
import { createIndexedDbCache } from "./indexeddb-cache.ts";

const clock = { now: () => new Date("2026-03-04T05:06:07.000Z") };
let dbName = "";
let counter = 0;
const opened: IDBDatabase[] = [];

function freshName(): string {
  counter += 1;
  dbName = `ghd-test-${counter}-${Date.now()}`;
  return dbName;
}

afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    for (const type of ["success", "error", "blocked"]) request.addEventListener(type, resolve);
  });
});

function rawOpen(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.addEventListener("success", () => {
      opened.push(request.result);
      resolve(request.result);
    });
    request.addEventListener("error", () => reject(request.error ?? new Error("open failed")));
  });
}

test("round-trips a record namespaced by account, stamped by the injected clock", async () => {
  const cache = createIndexedDbCache({ clock, name: freshName() });

  await cache.put("acc-1", "prDetail", "pr-7", { data: { title: "Fix" }, etag: 'W/"abc"' });

  expect(await cache.get("acc-1", "prDetail", "pr-7")).toEqual({
    accountId: "acc-1",
    key: "pr-7",
    fetchedAt: new Date("2026-03-04T05:06:07.000Z"),
    etag: 'W/"abc"',
    data: { title: "Fix" },
  });
  expect(await cache.get("acc-2", "prDetail", "pr-7")).toBeUndefined();
});

test("bumping SCHEMA_VERSION discards old data without an error (AC-3.5)", async () => {
  const name = freshName();
  const v1 = createIndexedDbCache({ clock, name, version: 1 });
  await v1.put("acc-1", "repos", "all", { data: ["a/b"] });

  const v2 = createIndexedDbCache({ clock, name, version: 2 });

  expect(await v2.get("acc-1", "repos", "all")).toBeUndefined();
  expect(await v2.getAll("repos")).toEqual([]);
  await v2.put("acc-1", "repos", "all", { data: ["c/d"] });
  expect((await v2.get("acc-1", "repos", "all"))?.data).toEqual(["c/d"]);
});

test("a corrupt record is a miss, not a crash, and is removed", async () => {
  const name = freshName();
  const cache = createIndexedDbCache({ clock, name });
  await cache.put("acc-1", "prLists", "good", { data: 1 });
  const raw = await rawOpen(name);
  await new Promise((resolve) => {
    const tx = raw.transaction("prLists", "readwrite");
    tx.objectStore("prLists").put({ accountId: "acc-1", key: "bad", fetchedAt: "yesterday" });
    tx.addEventListener("complete", resolve);
  });
  raw.close();

  expect(await cache.get("acc-1", "prLists", "bad")).toBeUndefined();
  expect((await cache.getAll("prLists")).map((e) => e.key)).toEqual(["good"]);
});

test("clearAccount removes only that account; clearAll removes everything", async () => {
  const cache = createIndexedDbCache({ clock, name: freshName() });
  await cache.put("acc-1", "seen", "pr-1", { data: true });
  await cache.put("acc-10", "seen", "pr-1", { data: true });
  await cache.put("acc-2", "requests", "r", { data: true });

  await cache.clearAccount("acc-1");
  expect((await cache.getAll("seen")).map((e) => e.accountId)).toEqual(["acc-10"]);

  await cache.delete("acc-10", "seen", "pr-1");
  expect(await cache.getAll("seen")).toEqual([]);

  await cache.clearAll();
  expect(await cache.getAll("requests")).toEqual([]);
});

test.each([
  ["missing", { idb: undefined }],
  [
    "throwing on open",
    {
      idb: {
        open: () => {
          throw new DOMException("denied", "SecurityError");
        },
      } as unknown as IDBFactory,
    },
  ],
])("works uncached when IndexedDB is %s", async (_label, idbOption) => {
  const cache = createIndexedDbCache({ clock, ...idbOption });

  await cache.put("acc-1", "repos", "all", { data: 1 });
  expect(await cache.get("acc-1", "repos", "all")).toBeUndefined();
  expect(await cache.getAll("repos")).toEqual([]);
  await cache.clearAccount("acc-1");
  await cache.clearAll();
});

test("a failed read drops the database and the next use rebuilds it", async () => {
  const name = freshName();
  (await rawOpen(name)).close(); // version 1 with none of the object stores

  const cache = createIndexedDbCache({ clock, name, version: 1 });

  expect(await cache.get("acc-1", "repos", "all")).toBeUndefined();
  await cache.put("acc-1", "repos", "all", { data: 1 });
  expect((await cache.get("acc-1", "repos", "all"))?.data).toBe(1);
});

test("works uncached when an older connection blocks the upgrade", async () => {
  const name = freshName();
  await rawOpen(name); // version 1, never closes on versionchange

  const cache = createIndexedDbCache({ clock, name, version: 2 });

  expect(await cache.get("acc-1", "repos", "all")).toBeUndefined();
});
