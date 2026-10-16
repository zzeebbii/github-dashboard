import { z } from "zod";
import type { CrossTabPort, RefreshedMessage } from "../../application/cross-tab.ts";
import { RATE_LIMIT_POOLS } from "../../application/rate-limits.ts";
import { toAccountId } from "../../domain/account.ts";

/**
 * CrossTabPort over a Web Lock and a BroadcastChannel (FR-3.9, ADR-0017). The tab holding
 * the `ghd-refresh` lock is the leader; the browser hands the lock to a waiting tab when
 * the leader closes. Without `navigator.locks` every tab is its own leader.
 *
 * Messages come from another tab of this origin, which may run an older build: they are
 * validated like any stored data, and an unreadable one is dropped.
 */

const LOCK = "ghd-refresh";
const noop = () => undefined;
const CHANNEL = "ghd";

const PoolSchema = z.object({
  limit: z.number(),
  remaining: z.number(),
  resetAt: z.date(),
  lastCost: z.number().nullable(),
});

const MessageSchema = z.object({
  type: z.literal("refreshed"),
  accountId: z.string(),
  at: z.date(),
  quota: z.partialRecord(z.enum(RATE_LIMIT_POOLS), PoolSchema),
  updates: z.array(
    z.object({ queryKey: z.array(z.unknown()), data: z.unknown(), updatedAt: z.number() }),
  ),
});

function parse(raw: unknown): RefreshedMessage | null {
  const parsed = MessageSchema.safeParse(raw);
  const accountId = parsed.success ? toAccountId(parsed.data.accountId) : null;
  return parsed.success && accountId !== null ? { ...parsed.data, accountId } : null;
}

interface Options {
  /** Defaults to the browser's; `undefined` means "no Web Locks". */
  readonly locks?: LockManager | undefined;
  readonly channel?: BroadcastChannel;
}

export function createWebLocksCrossTab(options: Options = {}): CrossTabPort & { close(): void } {
  // navigator.locks is missing outside secure contexts and in older browsers.
  const locks = "locks" in options ? options.locks : (navigator.locks as LockManager | undefined);
  const channel = options.channel ?? new BroadcastChannel(CHANNEL);
  const abort = new AbortController();
  let release: () => void = noop;

  return {
    runAsLeader(onLeader) {
      if (locks === undefined) {
        onLeader();
        return;
      }
      locks
        .request(LOCK, { signal: abort.signal }, () => {
          onLeader();
          // Held until close() or the tab goes away.
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        // An aborted wait (close() before the lock came) is not an error.
        .catch(() => undefined);
    },

    publish(message) {
      try {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- reason: a BroadcastChannel is same-origin by definition and takes no targetOrigin; the rule is about window.postMessage
        channel.postMessage(message);
      } catch {
        // Data that cannot be cloned, or a closed channel: the other tabs simply miss this
        // update and catch up on the next one. Never break the refresh over it.
      }
    },

    subscribe(listener) {
      const onMessage = (event: MessageEvent) => {
        const message = parse(event.data);
        if (message !== null) listener(message);
      };
      channel.addEventListener("message", onMessage);
      return () => {
        channel.removeEventListener("message", onMessage);
      };
    },

    close() {
      abort.abort();
      release();
      channel.close();
    },
  };
}
