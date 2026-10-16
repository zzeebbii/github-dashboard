// `.tsx` so this runs in the Chromium "component" project: BroadcastChannel and Web Locks
// need a real browser.
import { afterEach, beforeEach, expect, test } from "vitest";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import { renderApp } from "../../../tests/render.tsx";
import { guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import { CACHE_STORES } from "../../application/cache.ts";
import { borrowSessionTokens, purgeSessionOnlyCaches } from "../../application/startup.ts";
import { type Account, toAccountId } from "../../domain/account.ts";
import { createLocalAccountStore } from "../local-account-store.ts";
import { createGitHubAppAuth } from "./github-app-auth.ts";
import { createPatAuth } from "./pat-auth.ts";
import { createSessionSharing } from "./session-sharing.ts";
import { createTokenStorage, forgetTokens } from "./token-storage.ts";

const TOKEN = "github_pat_FAKE_session_sharing_token_1";
const NEW_TOKEN = "github_pat_FAKE_session_sharing_token_2";
const ACCESS = "ghu_FAKE_session_sharing_app_access_1";
const NEW_ACCESS = "ghu_FAKE_session_sharing_app_access_2";
const REFRESH = "ghr_FAKE_session_sharing_app_refresh_1";
const NEW_REFRESH = "ghr_FAKE_session_sharing_app_refresh_2";
guardAgainstTokenLeaks([TOKEN, NEW_TOKEN, ACCESS, NEW_ACCESS, REFRESH, NEW_REFRESH]);

const account = (id: number, rememberMe: boolean): Account => ({
  id: toAccountId(id)!,
  login: `octo-${id}`,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe,
});
const SESSION_ONLY = account(1000001, false);
const OTHER = account(1000002, false);
const tokenKey = `ghd:token:${SESSION_ONLY.id}`;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  localStorage.clear();
});

/** A tab's own sessionStorage: same-origin frames would share the page's. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
  };
}

/**
 * A "tab": its own sessionStorage and channel, the shared localStorage, and token storage
 * wired as main.tsx wires it.
 */
function openTab(timeoutMs?: number) {
  const session = memoryStorage();
  const sharing = createSessionSharing({
    channel: new BroadcastChannel("ghd-auth"),
    session,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  cleanups.push(() => {
    sharing.close();
  });
  const tokens = createTokenStorage(session, localStorage, "token", sharing.announce);
  const refreshTokens = createTokenStorage(session, localStorage, "refresh", sharing.announce);
  const hasToken = (id: string) => tokens.read(toAccountId(id)!) !== null;
  return { session, sharing, tokens, refreshTokens, hasToken };
}

/** Every message on the channel, as another tab would receive it. */
function listen(): unknown[] {
  const heard: unknown[] = [];
  const channel = new BroadcastChannel("ghd-auth");
  channel.addEventListener("message", (event: MessageEvent) => heard.push(event.data));
  cleanups.push(() => {
    channel.close();
  });
  return heard;
}

function accountsWith(...accounts: Account[]) {
  const store = createLocalAccountStore();
  for (const a of accounts) store.upsert(a);
  store.setActive(accounts[0]!.id);
  return store;
}

const offline = () => Promise.reject(new Error("no network in this test"));

test("a new tab borrows the session-only token and opens Home, not sign-in", async () => {
  const accounts = accountsWith(SESSION_ONLY);
  const first = openTab();
  first.tokens.write(SESSION_ONLY.id, TOKEN, false);
  const second = openTab();

  await borrowSessionTokens(accounts, second.hasToken, second.sharing);

  expect(second.session.getItem(tokenKey)).toBe(TOKEN);
  const { router } = await renderApp("/", {
    accountStore: accounts,
    auth: createPatAuth({ tokens: second.tokens, accounts, fetchImpl: offline }),
    hasToken: second.hasToken,
  });
  await expect.poll(() => router.state.location.pathname).toBe("/");
});

test("with no answer in time the tab stays signed out and goes to sign-in, as before", async () => {
  const accounts = accountsWith(SESSION_ONLY);
  const alone = openTab(50);
  const started = performance.now();

  await borrowSessionTokens(accounts, alone.hasToken, alone.sharing);

  expect(performance.now() - started).toBeLessThan(1000);
  const { router } = await renderApp("/", {
    accountStore: accounts,
    auth: createPatAuth({ tokens: alone.tokens, accounts, fetchImpl: offline }),
    hasToken: alone.hasToken,
  });
  await expect.poll(() => router.state.location.pathname).toBe("/sign-in");
});

test("run in main.tsx's order, the purge spares an account another tab supplied (FR-2.13)", async () => {
  const accounts = accountsWith(SESSION_ONLY, OTHER);
  const cache = inMemoryCache({ now: () => new Date() });
  await Promise.all(
    [SESSION_ONLY, OTHER].flatMap((a) =>
      CACHE_STORES.map((store) => cache.put(a.id, store, "k", { data: 1 })),
    ),
  );
  const first = openTab();
  first.tokens.write(SESSION_ONLY.id, TOKEN, false);
  const second = openTab();

  await borrowSessionTokens(accounts, second.hasToken, second.sharing);
  await purgeSessionOnlyCaches(accounts, second.hasToken, cache);

  const count = async (id: Account["id"]) =>
    (await Promise.all(CACHE_STORES.map((store) => cache.getAll(id, store)))).flat().length;
  expect(await count(SESSION_ONLY.id)).toBe(CACHE_STORES.length);
  // Nobody holds OTHER's token: its cache goes, as before.
  expect(await count(OTHER.id)).toBe(0);
});

test("a 401, a sign-out and sign out of everything in one tab clear the token in the other", async () => {
  const accounts = accountsWith(SESSION_ONLY, OTHER);
  const a = openTab();
  const b = openTab();
  const signIn = (id: Account["id"]) => {
    a.tokens.write(id, TOKEN, false);
    b.session.setItem(`ghd:token:${id}`, TOKEN);
  };

  // FR-2.8, wired as in main.tsx.
  signIn(SESSION_ONLY.id);
  forgetTokens(SESSION_ONLY.id, a.session, localStorage);
  a.sharing.announce(SESSION_ONLY.id);
  await expect.poll(() => b.session.getItem(tokenKey)).toBeNull();

  // Removing the account signs it out (AuthPort.signOut).
  signIn(SESSION_ONLY.id);
  createPatAuth({ tokens: a.tokens, accounts, fetchImpl: offline }).signOut(SESSION_ONLY.id);
  await expect.poll(() => b.session.getItem(tokenKey)).toBeNull();

  signIn(SESSION_ONLY.id);
  signIn(OTHER.id);
  b.session.setItem("unrelated", "kept");
  a.tokens.clearAll();
  await expect.poll(() => b.session.length).toBe(1);
  expect(b.session.getItem("unrelated")).toBe("kept");
});

test("a new token in one tab, and its refresh record, replace the other tab's", async () => {
  const a = openTab();
  const b = openTab();
  b.session.setItem(tokenKey, TOKEN);

  a.tokens.write(SESSION_ONLY.id, NEW_TOKEN, false);
  a.refreshTokens.write(SESSION_ONLY.id, `{"refreshToken":"${NEW_REFRESH}"}`, false);

  await expect.poll(() => b.session.getItem(tokenKey)).toBe(NEW_TOKEN);
  await expect
    .poll(() => b.session.getItem(`ghd:refresh:${SESSION_ONLY.id}`))
    .toContain(NEW_REFRESH);
});

test("remembered tokens are never broadcast, neither as a change nor as an answer", async () => {
  const accounts = accountsWith(SESSION_ONLY);
  const heard = listen();
  const a = openTab();
  a.tokens.write(SESSION_ONLY.id, TOKEN, true);
  const b = openTab(100);

  await borrowSessionTokens(accounts, () => false, b.sharing);

  await expect.poll(() => heard.length).toBe(2);
  expect(heard).toEqual(
    expect.arrayContaining([
      // The change only tells others to drop a session copy; localStorage is already shared.
      { type: "forget", accountIds: [SESSION_ONLY.id] },
      { type: "ask", accountIds: [SESSION_ONLY.id] },
    ]),
  );
  expect(JSON.stringify(heard)).not.toContain(TOKEN);
  expect(b.session.length).toBe(0);
});

test("malformed or foreign messages are ignored", async () => {
  const b = openTab();
  b.session.setItem(tokenKey, TOKEN);
  const other = new BroadcastChannel("ghd-auth");
  cleanups.push(() => {
    other.close();
  });
  const send = (message: unknown) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- reason: BroadcastChannel takes no targetOrigin
    other.postMessage(message);
  };

  send("garbage");
  send({ type: "forget", accountIds: ["../etc"] });
  send({ type: "forget-everything" });
  send({ type: "tokens", entries: [{ accountId: SESSION_ONLY.id, token: "x y", refresh: null }] });
  send({ type: "tokens", entries: [{ accountId: "nope", token: NEW_TOKEN, refresh: null }] });
  // A valid message last: once it has arrived, every message before it has been handled.
  send({ type: "tokens", entries: [{ accountId: OTHER.id, token: NEW_TOKEN, refresh: null }] });

  await expect.poll(() => b.session.getItem(`ghd:token:${OTHER.id}`)).toBe(NEW_TOKEN);
  expect(b.session.getItem(tokenKey)).toBe(TOKEN);
  expect(b.session.length).toBe(2);
});

test("without BroadcastChannel each tab keeps its own session", async () => {
  const sharing = createSessionSharing({ channel: null });

  await expect(sharing.request([SESSION_ONLY.id])).resolves.toBeUndefined();
  expect(() => {
    sharing.announce(SESSION_ONLY.id);
    sharing.close();
  }).not.toThrow();
});

test("two tabs refreshing the same single-use refresh token spend it once", async () => {
  const accounts = accountsWith({ ...SESSION_ONLY, tokenType: "github-app", rememberMe: true });
  const now = Date.parse("2026-10-16T08:00:00Z");
  localStorage.setItem(tokenKey, ACCESS);
  localStorage.setItem(
    `ghd:refresh:${SESSION_ONLY.id}`,
    JSON.stringify({
      refreshToken: REFRESH,
      accessExpiresAt: now + 60_000,
      refreshExpiresAt: now + 3_600_000,
    }),
  );
  const spent: unknown[] = [];
  const exchange = async (_url: RequestInfo | URL, init?: RequestInit) => {
    spent.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
    // Slow enough that the second tab asks while the first still waits.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Response.json({
      access_token: NEW_ACCESS,
      expires_in: 28800,
      refresh_token: NEW_REFRESH,
      refresh_token_expires_in: 15897600,
    });
  };
  const tab = () => {
    const tokens = createTokenStorage(sessionStorage, localStorage);
    return createGitHubAppAuth({
      config: { clientId: "Iv23liFAKEclientid01", exchangeUrl: "https://exchange.example.test" },
      base: createPatAuth({ tokens, accounts, fetchImpl: offline }),
      tokens,
      accounts,
      clock: { now: () => new Date(now) },
      fetchImpl: exchange,
    });
  };

  const results = await Promise.all([
    tab().currentToken(SESSION_ONLY.id),
    tab().currentToken(SESSION_ONLY.id),
  ]);

  expect(results).toEqual([NEW_ACCESS, NEW_ACCESS]);
  expect(spent).toEqual([{ grant_type: "refresh_token", refresh_token: REFRESH }]);
});
