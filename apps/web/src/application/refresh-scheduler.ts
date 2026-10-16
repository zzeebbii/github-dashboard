import type { Query, QueryClient } from "@tanstack/react-query";
import type { AccountId } from "../domain/account.ts";
import { FOCUS_REFRESH_AFTER_MS, nextRefreshDelay, REFRESH_INTERVAL_MS } from "../domain/quota.ts";
import type { CrossTabPort, QueryUpdate, RefreshedMessage } from "./cross-tab.ts";
import {
  RATE_LIMIT_POOLS,
  type QuotaSnapshot,
  type RateLimitPool,
  type RateLimitReader,
  type RateLimitState,
} from "./rate-limits.ts";

/**
 * The refresh scheduler (FR-3.7–3.9, ADR-0017). Every 5 minutes while visible and online,
 * on focus when the last refresh is over a minute old, on reconnect, and on demand. The
 * quota guard stretches or stops the automatic ones; a manual refresh always runs.
 *
 * Only the leader tab refreshes automatically, and it tells the others what changed. All
 * time and every browser signal come in through ports, so tests drive it without timers.
 */

/** A browser condition that can change: page visibility (plus focus), or being online. */
export interface PageSignal {
  current(): boolean;
  /** For visibility, also fires on window focus. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** setTimeout behind a port. Returns a cancel function. */
export type ScheduleTimer = (callback: () => void, ms: number) => () => void;

/**
 * Refreshes the active account's GitHub queries. A query plugs in by its key,
 * `[store, accountId, ...]` (query-hydration.ts), so T16 and T20's lists need no wiring.
 */
interface QueryRefresher {
  /** Refetches the account's mounted queries one at a time; returns the ones that changed. */
  refresh(accountId: AccountId): Promise<readonly QueryUpdate[]>;
  /** Applies another tab's results. */
  apply(updates: readonly QueryUpdate[]): void;
  /** When the account's newest query data was fetched, e.g. restored from the cache. */
  lastUpdated(accountId: AccountId): Date | null;
}

const ofAccount = (accountId: AccountId) => (query: Query) => query.queryKey[1] === accountId;

export function createQueryRefresher(client: QueryClient): QueryRefresher {
  return {
    async refresh(accountId) {
      const predicate = ofAccount(accountId);
      // Unmounted queries refetch when next shown, not now.
      await client.invalidateQueries({ predicate, refetchType: "none" });
      const updates: QueryUpdate[] = [];
      // One after another (FR-3.8), so a refresh never bursts against the secondary limit.
      for (const query of client.getQueryCache().findAll({ predicate, type: "active" })) {
        const before = query.state.data;
        // cancelRefetch false: join a fetch already running instead of restarting it.
        // oxlint-disable-next-line no-await-in-loop -- reason: FR-3.8 runs an account's queries one after another, on purpose
        await client.refetchQueries(
          { queryKey: query.queryKey, exact: true },
          { cancelRefetch: false },
        );
        const { data, dataUpdatedAt } = query.state;
        // Structural sharing keeps the same reference when nothing changed.
        if (data !== undefined && data !== before) {
          updates.push({ queryKey: query.queryKey, data, updatedAt: dataUpdatedAt });
        }
      }
      return updates;
    },

    apply(updates) {
      for (const { queryKey, data, updatedAt } of updates) {
        if ((client.getQueryState(queryKey)?.dataUpdatedAt ?? 0) >= updatedAt) continue;
        client.setQueryData(queryKey, data, { updatedAt });
      }
    },

    lastUpdated(accountId) {
      const newest = Math.max(
        0,
        ...client
          .getQueryCache()
          .findAll({ predicate: ofAccount(accountId) })
          .map((query) => query.state.dataUpdatedAt),
      );
      return newest > 0 ? new Date(newest) : null;
    },
  };
}

export interface RefreshState {
  readonly accountId: AccountId | null;
  readonly lastRefreshAt: Date | null;
  readonly refreshing: boolean;
  readonly online: boolean;
  /** The active account's pools, as of its last refresh (in whichever tab ran it). */
  readonly quota: QuotaSnapshot;
  /** The scheduler's clock, ticking every 30 s while visible, for "Updated N min ago". */
  readonly now: Date;
}

interface RefreshOutcome {
  readonly manual: boolean;
  readonly changed: boolean;
}

export interface RefreshScheduler {
  start(): void;
  stop(): void;
  setAccount(accountId: AccountId | null): void;
  /** Runs paused, hidden, follower or not; only offline is it skipped. */
  refreshNow(): Promise<void>;
  // Properties, not methods: useSyncExternalStore takes them unbound.
  readonly getState: () => RefreshState;
  readonly subscribe: (listener: () => void) => () => void;
  /** After every refresh, in this tab or another one. */
  onRefreshed(listener: (outcome: RefreshOutcome) => void): () => void;
}

interface RefreshSchedulerDeps {
  readonly clock: { now(): Date };
  readonly timer: ScheduleTimer;
  readonly visibility: PageSignal;
  readonly online: PageSignal;
  readonly crossTab: CrossTabPort;
  readonly rateLimits: RateLimitReader;
  readonly refresher: QueryRefresher;
}

const TICK_MS = 30_000;
const noop = () => undefined;

export function createRefreshScheduler(deps: RefreshSchedulerDeps): RefreshScheduler {
  const { clock, timer, visibility, online, crossTab, rateLimits, refresher } = deps;
  const listeners = new Set<() => void>();
  const outcomeListeners = new Set<(outcome: RefreshOutcome) => void>();
  const lastRefresh = new Map<AccountId, Date>();
  let leader = false;
  let running: Promise<void> | null = null;
  let manualPending = false;
  let cancelRefresh: () => void = noop;
  let cancelTick: () => void = noop;
  let unsubscribe: (() => void)[] = [];
  let state: RefreshState = {
    accountId: null,
    lastRefreshAt: null,
    refreshing: false,
    online: online.current(),
    quota: {},
    now: clock.now(),
  };

  function update(patch: Partial<RefreshState>) {
    state = { ...state, ...patch, now: clock.now() };
    for (const listener of listeners) listener();
  }

  function snapshot(accountId: AccountId): QuotaSnapshot {
    const quota: Partial<Record<RateLimitPool, RateLimitState>> = {};
    for (const pool of RATE_LIMIT_POOLS) {
      const known = rateLimits.get(accountId, pool);
      if (known !== undefined) quota[pool] = known;
    }
    return quota;
  }

  /** Until when the guard holds automatic refreshes back (epoch ms; 0 when it does not). */
  function pausedUntil(accountId: AccountId): number {
    const delay = nextRefreshDelay(rateLimits.get(accountId, "graphql"), REFRESH_INTERVAL_MS);
    const quota = delay.kind === "pausedUntil" ? delay.until.getTime() : 0;
    return Math.max(quota, rateLimits.pausedUntil(accountId)?.getTime() ?? 0);
  }

  const canAutoRefresh = () => leader && visibility.current() && online.current();

  /** Arms the one refresh timer for the next automatic refresh, if there should be one. */
  function schedule() {
    cancelRefresh();
    cancelRefresh = noop;
    const { accountId, lastRefreshAt } = state;
    if (accountId === null || !canAutoRefresh()) return;
    const delay = nextRefreshDelay(rateLimits.get(accountId, "graphql"), REFRESH_INTERVAL_MS);
    const last = lastRefreshAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const interval = delay.kind === "every" ? last + delay.ms : 0;
    const due = Math.max(interval, pausedUntil(accountId));
    cancelRefresh = timer(() => void run(false), Math.max(0, due - clock.now().getTime()));
  }

  /** Re-renders "Updated N min ago" while someone can see it. */
  function tick() {
    cancelTick();
    cancelTick = noop;
    if (!visibility.current()) return;
    cancelTick = timer(() => {
      update({});
      tick();
    }, TICK_MS);
  }

  function notify(outcome: RefreshOutcome) {
    for (const listener of outcomeListeners) listener(outcome);
  }

  function run(manual: boolean): Promise<void> {
    const { accountId } = state;
    // Offline every request would fail, and "updated" would claim otherwise (FR-3.11).
    if (accountId === null || !online.current()) return Promise.resolve();
    if (manual) manualPending = true;
    // One refresh at a time; a second request joins the running one.
    running ??= (async () => {
      update({ refreshing: true });
      let updates: readonly QueryUpdate[] = [];
      try {
        updates = await refresher.refresh(accountId);
      } finally {
        const at = clock.now();
        const quota = snapshot(accountId);
        lastRefresh.set(accountId, at);
        const wasManual = manualPending;
        manualPending = false;
        running = null;
        update(
          state.accountId === accountId
            ? { refreshing: false, lastRefreshAt: at, quota }
            : { refreshing: false },
        );
        crossTab.publish({ type: "refreshed", accountId, at, quota, updates });
        notify({ manual: wasManual, changed: updates.length > 0 });
        schedule();
      }
    })();
    return running;
  }

  function onMessage(message: RefreshedMessage) {
    lastRefresh.set(message.accountId, message.at);
    if (message.accountId !== state.accountId) return;
    refresher.apply(message.updates);
    update({ lastRefreshAt: message.at, quota: message.quota });
    notify({ manual: false, changed: message.updates.length > 0 });
    // Another tab's refresh resets this tab's interval too.
    schedule();
  }

  function onVisibility() {
    update({});
    tick();
    const { accountId, lastRefreshAt } = state;
    const now = clock.now().getTime();
    const stale = lastRefreshAt === null || now - lastRefreshAt.getTime() > FOCUS_REFRESH_AFTER_MS;
    if (accountId !== null && canAutoRefresh() && stale && pausedUntil(accountId) <= now) {
      void run(false);
    } else {
      schedule();
    }
  }

  function onOnline() {
    update({ online: online.current() });
    const { accountId } = state;
    // AC-3.9: coming back online refreshes at once (unless the guard says wait).
    if (accountId !== null && canAutoRefresh() && pausedUntil(accountId) <= clock.now().getTime()) {
      void run(false);
    } else {
      schedule();
    }
  }

  return {
    start() {
      unsubscribe = [
        visibility.subscribe(onVisibility),
        online.subscribe(onOnline),
        crossTab.subscribe(onMessage),
      ];
      crossTab.runAsLeader(() => {
        leader = true;
        schedule();
      });
      update({ online: online.current() });
      tick();
    },

    stop() {
      for (const off of unsubscribe) off();
      unsubscribe = [];
      leader = false;
      cancelRefresh();
      cancelTick();
    },

    setAccount(accountId) {
      if (accountId === state.accountId) return;
      update({
        accountId,
        lastRefreshAt:
          accountId === null
            ? null
            : (lastRefresh.get(accountId) ?? refresher.lastUpdated(accountId)),
        quota: accountId === null ? {} : snapshot(accountId),
      });
      schedule();
    },

    refreshNow: () => run(true),

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    onRefreshed(listener) {
      outcomeListeners.add(listener);
      return () => outcomeListeners.delete(listener);
    },
  };
}
