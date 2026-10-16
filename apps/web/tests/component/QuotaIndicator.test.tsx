import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import type { CrossTabMessage, CrossTabPort } from "../../src/application/cross-tab.ts";
import { type GitHubReadPort, HOME_SEARCHES } from "../../src/application/github.ts";
import { cachedListPullRequests } from "../../src/application/palette.ts";
import {
  createQueryRefresher,
  createRefreshScheduler,
} from "../../src/application/refresh-scheduler.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import { createRateLimitTracker } from "../../src/infrastructure/github/rate-limit.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { fakeSignal, manualTime } from "../fakes/fake-refresh-ports.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { createInMemoryGitHub } from "../fakes/in-memory-github.ts";
import { renderApp, testQueryClient } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

/**
 * The header's quota indicator with the real scheduler and the real rate-limit tracker: it
 * shows the latest known quota whenever any GitHub response carried one, in every tab, and
 * "–" only when nothing is known.
 */

const TOKEN = "github_pat_FAKE_quota_indicator_fixture_token";
guardAgainstTokenLeaks([TOKEN]);

const ACCOUNT: Account = {
  id: toAccountId(1000002)!,
  login: "octo-fixture",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const MINUTE = 60_000;
const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Cross-tab ports over one in-memory channel: what one tab publishes, the others receive. */
function channel() {
  const tabs: Set<(message: CrossTabMessage) => void>[] = [];
  return (leader: boolean): CrossTabPort => {
    const listeners = new Set<(message: CrossTabMessage) => void>();
    tabs.push(listeners);
    return {
      runAsLeader(onLeader) {
        if (leader) onLeader();
      },
      publish(message) {
        for (const other of tabs) {
          if (other !== listeners) for (const listener of other) listener(message);
        }
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  };
}

/** A Storage in memory: browser storage itself is for infrastructure/ only. */
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
 * One tab: the real tracker, fed the way the GitHub client feeds it (every Home search page
 * is one GraphQL response), under the real scheduler and the real route tree.
 */
async function openTab({
  time,
  crossTab,
  storage = null,
  restored = false,
  online = fakeSignal(true),
}: {
  time: ReturnType<typeof manualTime>;
  crossTab: CrossTabPort;
  storage?: Storage | null;
  /** Home's searches restored from the cache, just fetched: mounting requests nothing. */
  restored?: boolean;
  online?: ReturnType<typeof fakeSignal>;
}) {
  const tracker = createRateLimitTracker(time.clock, storage);
  let remaining = 5000;
  /** One GraphQL response for the account, as the client records it. */
  const respond = () => {
    remaining -= 1;
    tracker.fromGraphQL(ACCOUNT.id, {
      cost: 1,
      limit: 5000,
      remaining,
      resetAt: new Date(time.clock.now().getTime() + 40 * MINUTE).toISOString(),
    });
  };
  const github: GitHubReadPort = createInMemoryGitHub(undefined, {
    searchHome: () => {
      respond();
      return Promise.resolve({
        ok: true,
        value: { data: { pullRequests: [], nextCursor: null, totalCount: 0 }, partialErrors: [] },
      });
    },
  });
  const queryClient = restored
    ? new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
      })
    : testQueryClient();
  if (restored) {
    for (const search of HOME_SEARCHES) {
      queryClient.setQueryData(
        ["prLists", ACCOUNT.id, "home", search],
        { pullRequests: [], truncated: false, partialErrors: [] },
        { updatedAt: time.clock.now().getTime() },
      );
    }
  }
  const scheduler = createRefreshScheduler({
    clock: time.clock,
    timer: time.timer,
    visibility: fakeSignal(true),
    online,
    crossTab,
    rateLimits: tracker,
    refresher: createQueryRefresher(queryClient, cachedListPullRequests),
  });
  scheduler.start();
  const stop = () => {
    scheduler.stop();
  };
  stops.push(stop);
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const { screen } = await renderApp("/", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    queryClient,
    scheduler,
    github,
  });
  await expect.element(screen.locator.getByRole("heading", { level: 1 })).toBeInTheDocument();
  await time.advance(0);
  const quota = (text: string) =>
    screen.locator.getByRole("button", { name: `API quota: ${text}`, exact: true });
  return {
    respond,
    /** The button as it should read now: what this tab's last response said. */
    latest: () => quota(`${remaining.toLocaleString("en")} left`),
    quota,
    async close() {
      await screen.unmount();
      stop();
    },
  };
}

test("on first load the quota shows once the first data has loaded", async () => {
  const tab = await openTab({ time: manualTime(), crossTab: channel()(true) });

  await expect.element(tab.latest()).toBeVisible();
});

test("a request outside a scheduled refresh shows at once (opening a PR, say)", async () => {
  const tab = await openTab({ time: manualTime(), crossTab: channel()(true) });
  await expect.element(tab.latest()).toBeVisible();

  tab.respond();
  tab.respond();

  await expect.element(tab.latest()).toBeVisible();
  await expectNoAxeViolations(document.body);
});

test("a follower tab shows the quota of a request made in another tab", async () => {
  const time = manualTime();
  const port = channel();
  const leader = await openTab({ time, crossTab: port(true) });
  await expect.element(leader.latest()).toBeVisible();
  // A follower whose Home was restored fresh requests nothing itself.
  const follower = await openTab({ time, crossTab: port(false), restored: true });
  await expect.element(follower.quota("–")).toBeVisible();

  leader.respond();

  await expect.element(leader.latest()).toBeVisible();
  const shown = leader.latest().element().textContent.replace("API quota: ", "");
  await expect.element(follower.quota(shown)).toBeVisible();
});

test("after a reload with fresh cached data, the last known quota shows with its age", async () => {
  const time = manualTime();
  // The tab's sessionStorage, which survives the reload.
  const storage = memoryStorage();
  const first = await openTab({ time, crossTab: channel()(true), storage });
  await expect.element(first.latest()).toBeVisible();
  const shown = first.latest().element().textContent.replace("API quota: ", "");
  await first.close();

  await time.advance(2 * MINUTE);
  // The reload: a new tracker and scheduler, Home restored fresh, so no request is made.
  const reloaded = await openTab({ time, crossTab: channel()(true), storage, restored: true });

  await expect.element(reloaded.quota(shown)).toBeVisible();
  await reloaded.quota(shown).click();
  const popover = page.getByRole("group", { name: "API quota" });
  await expect.element(popover).toBeVisible();
  expect(popover.element().textContent).toMatch(/checked 2 min\. ago/);
  await expectNoAxeViolations(document.body);
});

test("once the window resets with nothing fetched since, it says it does not know", async () => {
  const time = manualTime();
  const online = fakeSignal(true);
  const tab = await openTab({ time, crossTab: channel()(true), online });
  await expect.element(tab.latest()).toBeVisible();

  // Offline nothing refreshes, so nothing new is learnt before the reset.
  online.set(false);
  await time.advance(41 * MINUTE);

  await expect.element(tab.quota("–")).toBeVisible();
});
