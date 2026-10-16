import type { AccountStore, HasToken } from "./accounts.ts";
import type { CachePort } from "./cache.ts";

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
