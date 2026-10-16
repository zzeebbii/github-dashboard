import type { AccountId } from "../domain/account.ts";
import type { QuotaSnapshot } from "./rate-limits.ts";

/**
 * One leader tab refreshes; the others follow (FR-3.9, ADR-0017). The adapter in
 * infrastructure/cross-tab/ uses a Web Lock and a BroadcastChannel.
 */

/** A query whose data changed in a refresh, as the leader's query client holds it. */
export interface QueryUpdate {
  readonly queryKey: readonly unknown[];
  readonly data: unknown;
  readonly updatedAt: number;
}

/** What a tab tells the others after it refreshed. */
export interface RefreshedMessage {
  readonly type: "refreshed";
  readonly accountId: AccountId;
  readonly at: Date;
  readonly quota: QuotaSnapshot;
  readonly updates: readonly QueryUpdate[];
}

export interface CrossTabPort {
  /**
   * Calls `onLeader` once this tab becomes the leader, which it stays until it closes.
   * Without Web Locks every tab is its own leader, at once.
   */
  runAsLeader(onLeader: () => void): void;
  /** Delivered to every other tab, never back to this one. */
  publish(message: RefreshedMessage): void;
  subscribe(listener: (message: RefreshedMessage) => void): () => void;
}
