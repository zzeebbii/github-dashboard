import type { AccountStore } from "../../src/application/accounts.ts";
import type { Account, AccountId } from "../../src/domain/account.ts";
import type { Favourite } from "../../src/domain/favourites.ts";

/** An `AccountStore` in a Map, for component tests. */
export function createInMemoryAccountStore(initial: readonly Account[] = []): AccountStore {
  const accounts = new Map(initial.map((a) => [a.id, a]));
  const favourites = new Map<AccountId, readonly Favourite[]>();
  let active: AccountId | null = null;

  return {
    list: () => [...accounts.values()],
    get: (id) => accounts.get(id),
    upsert: (account) => void accounts.set(account.id, account),
    remove(id) {
      accounts.delete(id);
      favourites.delete(id);
      if (active === id) active = null;
    },
    activeId: () => active,
    setActive(id) {
      active = id;
    },
    favourites: (id) => favourites.get(id) ?? [],
    setFavourites: (id, list) => void favourites.set(id, [...list]),
  };
}
