import { z } from "zod";
import type { AccountStore } from "../application/accounts.ts";
import { type Account, type AccountId, toAccountId } from "../domain/account.ts";

const ACCOUNTS_KEY = "ghd:accounts";
const ACTIVE_KEY = "ghd:active-account";

// Our own data, but browser storage is user-editable and survives app upgrades, so it
// is parsed on read. Unknown keys are stripped: nothing but these fields is ever kept.
const StoredAccountSchema = z.object({
  id: z.string(),
  login: z.string(),
  avatarUrl: z.string(),
  tokenType: z.enum(["classic", "fine-grained"]),
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable(),
  rememberMe: z.boolean(),
});

function toAccount(value: unknown): Account | null {
  const parsed = StoredAccountSchema.safeParse(value);
  if (!parsed.success) return null;
  const id = toAccountId(parsed.data.id);
  return id === null ? null : { ...parsed.data, id };
}

function readJson(storage: Storage, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/** Non-secret account data in `localStorage`. Corrupt entries are dropped, not thrown. */
export function createLocalAccountStore(storage: Storage = localStorage): AccountStore {
  function list(): Account[] {
    const raw = readJson(storage, ACCOUNTS_KEY);
    return Array.isArray(raw) ? raw.map(toAccount).filter((a) => a !== null) : [];
  }

  function save(accounts: readonly Account[]): void {
    // Re-parse so only schema fields reach storage, whatever object was passed in.
    storage.setItem(
      ACCOUNTS_KEY,
      JSON.stringify(accounts.map((a) => StoredAccountSchema.parse(a))),
    );
  }

  function activeId(): AccountId | null {
    const id = toAccountId(storage.getItem(ACTIVE_KEY) ?? "");
    return id !== null && list().some((a) => a.id === id) ? id : null;
  }

  return {
    list,
    get: (id) => list().find((a) => a.id === id),
    upsert(account) {
      // Replace in place so a refresh does not reorder the list.
      const accounts = list();
      const index = accounts.findIndex((a) => a.id === account.id);
      if (index === -1) accounts.push(account);
      else accounts[index] = account;
      save(accounts);
    },
    remove(id) {
      save(list().filter((a) => a.id !== id));
      if (storage.getItem(ACTIVE_KEY) === id) storage.removeItem(ACTIVE_KEY);
    },
    activeId,
    setActive(id) {
      if (id === null) storage.removeItem(ACTIVE_KEY);
      else storage.setItem(ACTIVE_KEY, id);
    },
  };
}
