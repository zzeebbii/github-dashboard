import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { AccountId } from "../domain/account.ts";
import type { CachePort } from "./cache.ts";
import { OWN_REFRESH_ONLY } from "./refresh-scheduler.ts";

/**
 * Seen markers (FR-5.8): when this account last opened each PR on this device. They live in
 * the cache's `seen` store, so they are per account and per device, and are cleared with the
 * account. The marker is the record's `fetchedAt`, stamped by the cache's clock: no payload
 * to validate on read.
 */
export interface SeenMarkers {
  /** PR node id → when it was last opened (ISO 8601). */
  getSeen(accountId: AccountId): Promise<Readonly<Record<string, string>>>;
  markSeen(accountId: AccountId, prId: string): Promise<void>;
}

export function createSeenMarkers(cache: CachePort): SeenMarkers {
  return {
    async getSeen(accountId) {
      const entries = await cache.getAll(accountId, "seen");
      return Object.fromEntries(entries.map((entry) => [entry.key, entry.fetchedAt.toISOString()]));
    },
    markSeen: (accountId, prId) => cache.put(accountId, "seen", prId, { data: null }),
  };
}

/** main.tsx wires the IndexedDB-backed markers; tests/render.tsx an in-memory cache. */
export const SeenContext = createContext<SeenMarkers | null>(null);

function useSeenMarkers(): SeenMarkers {
  const markers = useContext(SeenContext);
  if (markers === null) {
    throw new Error(
      "useSeen must be used inside <SeenContext>. In tests, use renderWithProviders() from tests/render.tsx.",
    );
  }
  return markers;
}

/**
 * An account's seen markers, read once from the cache and kept in the query client (no
 * GitHub request, so outside the refresh schedule), and `markSeen` for opening a PR.
 */
export function useSeen(accountId: AccountId) {
  const markers = useSeenMarkers();
  const client = useQueryClient();
  const options = queryOptions({
    queryKey: ["seen", accountId] as const,
    queryFn: () => markers.getSeen(accountId),
    staleTime: Number.POSITIVE_INFINITY,
    meta: OWN_REFRESH_ONLY,
  });
  const query = useQuery(options);
  return {
    /** null until loaded, so "+N new" stays hidden rather than guessed. */
    seen: query.data ?? null,
    /** Opening a PR (panel or "Open in GitHub") resets its "+N new" to 0 (AC-5.3). */
    markSeen: async (prId: string): Promise<void> => {
      await markers.markSeen(accountId, prId);
      await client.invalidateQueries({ queryKey: options.queryKey });
    },
  };
}
