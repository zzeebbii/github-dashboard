import { z } from "zod";
import type { SessionTokenSource } from "../../application/startup.ts";
import { type AccountId, toAccountId } from "../../domain/account.ts";
import { createTokenStorage, tokenKey } from "./token-storage.ts";

/**
 * Shares session-only tokens between this app's open tabs (ADR-0016, amendment
 * 2026-10-16). `sessionStorage` is per tab, so without this a PR opened in a new tab lands
 * on sign-in. Tokens travel over a same-origin BroadcastChannel, in memory only, and are
 * gone when the last tab closes.
 *
 * Protocol on `ghd-auth` (separate from the refresh channel `ghd`):
 * - `ask { accountIds }`: a new tab asks for the tokens it lacks.
 * - `tokens { entries }`: an answer, or a token that changed (sign-in, refresh rotation).
 *   Every receiver writes the entries to its own `sessionStorage`.
 * - `forget { accountIds }` / `forget-all`: a token was removed in one tab; every receiver
 *   drops its session copy, so it cannot be revived from there.
 *
 * Only `sessionStorage` is ever read for sending or written on receipt. Remembered tokens
 * live in `localStorage`, which every tab already shares, so they are never broadcast.
 * Messages come from another tab of this origin, possibly an older build: each is
 * validated, and anything unreadable is dropped.
 */

const CHANNEL = "ghd-auth";
/** How long a new tab waits for an answer before it goes on to sign-in. */
const ASK_TIMEOUT_MS = 250;

const Token = z.string().regex(/^\w{20,255}$/);
const Id = z.string().transform((raw, ctx) => {
  const id = toAccountId(raw);
  if (id === null) {
    ctx.addIssue({ code: "custom", message: "not an account id" });
    return z.NEVER;
  }
  return id;
});
const Ids = z.array(Id).max(50);

const MessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ask"), accountIds: Ids }),
  z.object({
    type: z.literal("tokens"),
    entries: z
      .array(
        z.object({
          accountId: Id,
          token: Token,
          // The GitHub App refresh record as stored; github-app-auth.ts validates it on read.
          refresh: z.string().max(4096).nullable(),
        }),
      )
      .max(50),
  }),
  z.object({ type: z.literal("forget"), accountIds: Ids }),
  z.object({ type: z.literal("forget-all") }),
]);
type Message = z.infer<typeof MessageSchema>;

interface Options {
  /** Defaults to a channel named `ghd-auth`; `null` means "no BroadcastChannel". */
  readonly channel?: BroadcastChannel | null;
  readonly session?: Storage;
  readonly timeoutMs?: number;
}

export interface SessionSharing extends SessionTokenSource {
  /** Tells the other tabs this account's token (null: every token) changed here. */
  readonly announce: (id: AccountId | null) => void;
  close(): void;
}

/** The access and refresh token storages main.tsx uses, both announcing every change. */
export function sharedTokenStorages(sharing: SessionSharing) {
  return {
    tokens: createTokenStorage(sessionStorage, localStorage, "token", sharing.announce),
    refreshTokens: createTokenStorage(sessionStorage, localStorage, "refresh", sharing.announce),
  };
}

export function createSessionSharing(options: Options = {}): SessionSharing {
  const channel =
    options.channel !== undefined
      ? options.channel
      : typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CHANNEL);
  const session = options.session ?? sessionStorage;
  const timeoutMs = options.timeoutMs ?? ASK_TIMEOUT_MS;
  // Without BroadcastChannel every tab keeps its own session, as before.
  if (channel === null) {
    return { request: () => Promise.resolve(), announce: () => undefined, close: () => undefined };
  }

  const received = new Set<() => void>();

  function post(message: Message): void {
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- reason: a BroadcastChannel is same-origin by definition and takes no targetOrigin; the rule is about window.postMessage
      channel?.postMessage(message);
    } catch {
      // A closed channel: the other tabs keep what they have.
    }
  }

  function entry(id: AccountId) {
    const token = session.getItem(tokenKey("token", id));
    return token === null
      ? null
      : { accountId: id, token, refresh: session.getItem(tokenKey("refresh", id)) };
  }

  function forget(id: AccountId): void {
    session.removeItem(tokenKey("token", id));
    session.removeItem(tokenKey("refresh", id));
  }

  function onMessage(event: MessageEvent): void {
    const parsed = MessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    switch (message.type) {
      case "ask": {
        const entries = message.accountIds.map(entry).filter((e) => e !== null);
        if (entries.length > 0) post({ type: "tokens", entries });
        return;
      }
      case "tokens":
        for (const { accountId, token, refresh } of message.entries) {
          session.setItem(tokenKey("token", accountId), token);
          if (refresh === null) session.removeItem(tokenKey("refresh", accountId));
          else session.setItem(tokenKey("refresh", accountId), refresh);
        }
        for (const resolve of received) resolve();
        return;
      case "forget":
        message.accountIds.forEach(forget);
        return;
      case "forget-all":
        // Backwards, since removing shifts the indexes after it.
        for (let i = session.length - 1; i >= 0; i -= 1) {
          const key = session.key(i);
          if (key?.startsWith("ghd:token:") === true || key?.startsWith("ghd:refresh:") === true) {
            session.removeItem(key);
          }
        }
    }
  }
  channel.addEventListener("message", onMessage);

  return {
    request(ids) {
      if (ids.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          received.delete(done);
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        received.add(done);
        post({ type: "ask", accountIds: [...ids] });
      });
    },

    announce(id) {
      // After the current task, so a token and its refresh record written together travel together.
      queueMicrotask(() => {
        if (id === null) {
          post({ type: "forget-all" });
          return;
        }
        const current = entry(id);
        post(
          current === null
            ? { type: "forget", accountIds: [id] }
            : { type: "tokens", entries: [current] },
        );
      });
    },

    close() {
      channel.removeEventListener("message", onMessage);
      channel.close();
    },
  };
}
