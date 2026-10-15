import type { AccountStore } from "../../src/application/accounts.ts";
import type { Account, AccountId } from "../../src/domain/account.ts";

/** An `AccountStore` in a Map, for component tests. */
export function createInMemoryAccountStore(initial: readonly Account[] = []): AccountStore {
  const accounts = new Map(initial.map((a) => [a.id, a]));
  let active: AccountId | null = null;

  return {
    list: () => [...accounts.values()],
    get: (id) => accounts.get(id),
    upsert: (account) => void accounts.set(account.id, account),
    remove(id) {
      accounts.delete(id);
      if (active === id) active = null;
    },
    activeId: () => active,
    setActive(id) {
      active = id;
    },
  };
}
