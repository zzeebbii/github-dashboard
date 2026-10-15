import type { Account, AccountId } from "../domain/account.ts";

/** Non-secret account data. Never holds a token (FR-2.10). */
export interface AccountStore {
  list(): readonly Account[];
  get(id: AccountId): Account | undefined;
  /** Inserts, or replaces the account with the same GitHub user id. */
  upsert(account: Account): void;
  /** Also clears the active id if it pointed at this account. */
  remove(id: AccountId): void;
  activeId(): AccountId | null;
  setActive(id: AccountId | null): void;
}
