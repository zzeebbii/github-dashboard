import type { AccountId } from "../domain/account.ts";
import type { AccountStore, HasToken } from "./accounts.ts";
import type { CachePort } from "./cache.ts";

/**
 * This app's other open tabs, which may hold session-only tokens this tab lacks (ADR-0016,
 * amendment 2026-10-16). The adapter is infrastructure/auth/session-sharing.ts.
 */
export interface SessionTokenSource {
  /**
   * Asks for these accounts' tokens and stores whatever arrives in this tab's session.
   * Resolves on the first answer or after a short wait, whichever comes first.
   */
  request(ids: readonly AccountId[]): Promise<void>;
}

/**
 * Run first, before the purge below: a tab opened from another one (a PR in a new tab)
 * borrows the session-only tokens it lacks, so it neither lands on sign-in nor purges the
 * cache of an account that is still signed in elsewhere.
 */
export async function borrowSessionTokens(
  accounts: AccountStore,
  hasToken: HasToken,
  source: SessionTokenSource,
): Promise<void> {
  const missing = accounts.list().filter((a) => !a.rememberMe && !hasToken(a.id));
  await source.request(missing.map((a) => a.id));
}

/**
 * FR-2.13, run before the first render and before hydration: an account without
 * "remember me" whose session token is gone (a new browser session) loses its cached
 * GitHub data, so private-repo content does not outlive the session allowed to read it.
 * The account record stays, keeping its favourites and preferences; it shows as signed out.
 */
export async function purgeSessionOnlyCaches(
  accounts: AccountStore,
  hasToken: HasToken,
  cache: CachePort,
): Promise<void> {
  const expired = accounts.list().filter((a) => !a.rememberMe && !hasToken(a.id));
  await Promise.all(expired.map((a) => cache.clearAccount(a.id)));
}
