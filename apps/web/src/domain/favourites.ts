import type { Actor } from "./pull-request.ts";

/**
 * Repositories and favourites (FR-4.1, 4.4, 4.5, 4.7, 4.8). Plain types: the GitHub
 * adapter validates and maps onto these.
 */

/** A repository the account can reach, for the sidebar list (FR-4.1). */
export interface Repository {
  /** GitHub's node id; stable across renames and transfers. */
  readonly id: string;
  /** `owner/name`. */
  readonly nameWithOwner: string;
  readonly visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
  readonly description: string | null;
}

/** A favourite as stored per account (FR-4.4): the node id is what is followed. */
export interface Favourite {
  readonly nodeId: string;
  /** The last `owner/name` seen, updated silently on rename (FR-4.7). */
  readonly nameWithOwner: string;
}

/** An open PR of a favourite: enough to list and count it, and to open it from cache. */
interface OpenPullRequest {
  readonly id: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly isDraft: boolean;
  readonly author: Actor | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly headSha: string;
}

/** What one refresh learnt about one favourite. */
export type FavouriteLookup =
  | {
      readonly kind: "found";
      readonly nodeId: string;
      readonly nameWithOwner: string;
      /** All open PRs, including those beyond `pullRequests`. */
      readonly openCount: number;
      readonly pullRequests: readonly OpenPullRequest[];
    }
  /** The id no longer resolves: deleted, or access lost for good. */
  | { readonly kind: "missing"; readonly nodeId: string }
  /** Not readable this time (an SSO or policy error, reported beside it). */
  | { readonly kind: "unknown"; readonly nodeId: string };

export type FavouriteStatus =
  | {
      readonly state: "available";
      readonly favourite: Favourite;
      readonly openCount: number;
      readonly pullRequests: readonly OpenPullRequest[];
    }
  /** FR-4.7: shown as "Unavailable" with a Remove action. */
  | { readonly state: "unavailable"; readonly favourite: Favourite }
  /** Not refreshed yet, or unreadable this time. */
  | { readonly state: "pending"; readonly favourite: Favourite };

/** FR-4.5: favourites per GraphQL request. */
export const FAVOURITES_PER_REQUEST = 25;

/** FR-4.8: above this many favourites, a notice explains the refresh cost. */
const COST_NOTICE_ABOVE = 50;

/** `items` in consecutive groups of `size`, the last one shorter. */
export function batchesOf<T>(items: readonly T[], size = FAVOURITES_PER_REQUEST): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export function showsRefreshCostNotice(favouriteCount: number): boolean {
  return favouriteCount > COST_NOTICE_ABOVE;
}

/**
 * Applies what a refresh found (FR-4.7, AC-4.4): a renamed repository takes its new name,
 * one whose id no longer resolves is unavailable. `renamed` says whether the stored list
 * should be saved again.
 */
export function reconcileFavourites(
  favourites: readonly Favourite[],
  lookups: readonly FavouriteLookup[],
): { readonly statuses: readonly FavouriteStatus[]; readonly renamed: boolean } {
  const byId = new Map(lookups.map((lookup) => [lookup.nodeId, lookup]));
  let renamed = false;
  const statuses = favourites.map((favourite): FavouriteStatus => {
    const lookup = byId.get(favourite.nodeId);
    if (lookup === undefined || lookup.kind === "unknown") return { state: "pending", favourite };
    if (lookup.kind === "missing") return { state: "unavailable", favourite };
    if (lookup.nameWithOwner !== favourite.nameWithOwner) renamed = true;
    return {
      state: "available",
      favourite: { nodeId: favourite.nodeId, nameWithOwner: lookup.nameWithOwner },
      openCount: lookup.openCount,
      pullRequests: lookup.pullRequests,
    };
  });
  return { statuses, renamed };
}
