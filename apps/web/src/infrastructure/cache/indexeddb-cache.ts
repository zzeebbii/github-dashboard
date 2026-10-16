import { z } from "zod";
import {
  CACHE_STORES,
  type CachePort,
  type CacheStore,
  type CacheEntry,
} from "../../application/cache.ts";
import type { AccountId } from "../../domain/account.ts";

/**
 * CachePort over raw IndexedDB (ADR-0017). One object store per CacheStore, keyed by
 * `[accountId, key]`. Bump SCHEMA_VERSION whenever the record or data shape changes:
 * the upgrade drops every store, so old data is discarded silently (AC-3.5).
 *
 * Failure policy: the cache is an optimisation. If IndexedDB is missing, refuses to open
 * or is blocked, every read is a miss and every write a no-op. A corrupt record is a miss
 * and is deleted; a failed request drops the database so the next use rebuilds it.
 */

const SCHEMA_VERSION = 1;

const RecordSchema = z.object({
  accountId: z.string(),
  key: z.string(),
  schemaVersion: z.number(),
  fetchedAt: z.number(),
  etag: z.string().optional(),
  data: z.unknown(),
});
type CacheRecord = z.infer<typeof RecordSchema>;

interface Options {
  readonly clock: { now(): Date };
  readonly name?: string;
  readonly version?: number;
  /** Defaults to the browser's; `undefined` behaves as "IndexedDB unavailable". */
  readonly idb?: IDBFactory | undefined;
}

// Arrays sort after strings, so [id, []] bounds every string key for this account.
const accountRange = (accountId: AccountId) => IDBKeyRange.bound([accountId], [accountId, []]);

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

/** Every read is by account, so the caller's id is the record's id (and branded). */
function toEntry(accountId: AccountId, record: CacheRecord): CacheEntry {
  return {
    accountId,
    key: record.key,
    fetchedAt: new Date(record.fetchedAt),
    ...(record.etag === undefined ? {} : { etag: record.etag }),
    data: record.data,
  };
}

export function createIndexedDbCache(options: Options): CachePort {
  const name = options.name ?? "ghd";
  const version = options.version ?? SCHEMA_VERSION;
  const idb = "idb" in options ? options.idb : globalThis.indexedDB;
  let connection: Promise<IDBDatabase | null> | undefined;

  function open(): Promise<IDBDatabase | null> {
    connection ??= new Promise((resolve) => {
      if (idb === undefined) {
        resolve(null);
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = idb.open(name, version);
      } catch {
        resolve(null);
        return;
      }
      let blocked = false;
      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        for (const store of Array.from(db.objectStoreNames)) db.deleteObjectStore(store);
        for (const store of CACHE_STORES) {
          db.createObjectStore(store, { keyPath: ["accountId", "key"] });
        }
      });
      request.addEventListener("success", () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        // Another tab is upgrading: step aside, and reopen (at the new version) on next use.
        db.addEventListener("versionchange", () => {
          db.close();
          connection = undefined;
        });
        resolve(db);
      });
      request.addEventListener("error", () => resolve(null));
      // An older tab holds the database open. Run uncached rather than wait.
      request.addEventListener("blocked", () => {
        blocked = true;
        resolve(null);
      });
    });
    return connection;
  }

  async function drop(db: IDBDatabase): Promise<void> {
    db.close();
    connection = undefined;
    if (idb === undefined) return;
    await settle(idb.deleteDatabase(name)).catch(() => undefined);
  }

  async function run<T>(
    store: CacheStore,
    mode: IDBTransactionMode,
    action: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | undefined> {
    const db = await open();
    if (db === null) return undefined;
    try {
      return await settle(action(db.transaction(store, mode).objectStore(store)));
    } catch {
      await drop(db);
      return undefined;
    }
  }

  function parse(raw: unknown): CacheRecord | undefined {
    const parsed = RecordSchema.safeParse(raw);
    return parsed.success && parsed.data.schemaVersion === version ? parsed.data : undefined;
  }

  async function deleteRecord(accountId: AccountId, store: CacheStore, key: string) {
    await run(store, "readwrite", (s) => s.delete([accountId, key]));
  }

  async function eachStore(action: (s: IDBObjectStore) => IDBRequest<undefined>) {
    await Promise.all(CACHE_STORES.map((store) => run(store, "readwrite", action)));
  }

  return {
    async get(accountId, store, key) {
      const raw: unknown = await run<unknown>(store, "readonly", (s) => s.get([accountId, key]));
      if (raw === undefined) return undefined;
      const record = parse(raw);
      if (record === undefined) await deleteRecord(accountId, store, key);
      return record === undefined ? undefined : toEntry(accountId, record);
    },

    async put(accountId, store, key, value) {
      const record: CacheRecord = {
        accountId,
        key,
        schemaVersion: version,
        fetchedAt: options.clock.now().getTime(),
        ...(value.etag === undefined ? {} : { etag: value.etag }),
        data: value.data,
      };
      await run(store, "readwrite", (s) => s.put(record));
    },

    delete: deleteRecord,

    async getAll(accountId, store) {
      const raw =
        (await run<unknown[]>(store, "readonly", (s) => s.getAll(accountRange(accountId)))) ?? [];
      return raw.flatMap((r) => {
        const record = parse(r);
        return record === undefined || record.accountId !== accountId
          ? []
          : [toEntry(accountId, record)];
      });
    },

    async clearAccount(accountId) {
      await eachStore((s) => s.delete(accountRange(accountId)));
    },

    async clearAll() {
      // Empty every store first: deleting the database waits for other tabs to close it,
      // and the data must be gone now, not then.
      await eachStore((s) => s.clear());
      const db = await open();
      if (db !== null) db.close();
      connection = undefined;
      if (idb === undefined) return;
      await new Promise<void>((resolve) => {
        try {
          const request = idb.deleteDatabase(name);
          for (const type of ["success", "error", "blocked"]) {
            request.addEventListener(type, () => resolve());
          }
        } catch {
          resolve();
        }
      });
    },
  };
}
