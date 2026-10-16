import { afterEach, beforeAll, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  createQueryRefresher,
  createRefreshScheduler,
} from "../../src/application/refresh-scheduler.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import styles from "../../src/styles.css?inline";
import { expectNoAxeViolations } from "../axe.ts";
import {
  fakeRateLimits,
  fakeSignal,
  inMemoryCrossTab,
  manualTime,
  settle,
} from "../fakes/fake-refresh-ports.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { renderApp, testQueryClient } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN = "github_pat_FAKE_freshness_fixture_token";
guardAgainstTokenLeaks([TOKEN]);

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-fixture",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const MINUTE = 60_000;
const stops: (() => void)[] = [];

// The real stylesheet: contrast and the 1100 px label breakpoint depend on it.
beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await page.viewport(1280, 800);
});

async function setup({ width = 1280 } = {}) {
  await page.viewport(width, 800);
  const time = manualTime();
  const online = fakeSignal(true);
  const rateLimits = fakeRateLimits(time.clock);
  const queryClient = testQueryClient();
  const refresher = createQueryRefresher(queryClient);
  let refreshes = 0;
  const scheduler = createRefreshScheduler({
    clock: time.clock,
    timer: time.timer,
    visibility: fakeSignal(true),
    online,
    crossTab: inMemoryCrossTab(),
    rateLimits,
    refresher: {
      ...refresher,
      refresh(accountId) {
        refreshes += 1;
        return refresher.refresh(accountId);
      },
    },
  });
  scheduler.start();
  stops.push(() => {
    scheduler.stop();
  });

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
  });
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  // The first refresh is due as soon as the shell sets the account.
  await expect
    .poll(async () => {
      await time.advance(0);
      return refreshes;
    })
    .toBe(1);
  return { screen, time, online, rateLimits, scheduler, refreshes: () => refreshes };
}

const refreshButton = () => page.getByRole("button", { name: /^Refresh/ });

test("shows how old the data is, live, and refreshes on demand with an announcement", async () => {
  const { time, refreshes } = await setup();
  await expect.element(refreshButton()).toHaveAccessibleName("Refresh, Updated just now");

  await time.advance(4 * MINUTE);
  const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" }).format(
    -4,
    "minute",
  );
  await expect.element(refreshButton()).toHaveAccessibleName(`Refresh, Updated ${ago}`);
  await expect.element(page.getByText(`Updated ${ago}`)).toBeVisible();

  await refreshButton().click();

  expect(refreshes()).toBe(2);
  await expect.element(page.getByRole("status")).toHaveTextContent("Dashboard refreshed");
  await expect.element(refreshButton()).toHaveAccessibleName("Refresh, Updated just now");
  await expectNoAxeViolations(document.body);
});

test("offline shows the banner with the last refresh time; online refreshes (AC-3.9)", async () => {
  const { time, online, refreshes } = await setup();
  const lastRefresh = time.clock.now();

  online.set(false);
  await time.advance(10 * MINUTE);

  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    lastRefresh,
  );
  const banner = page
    .getByRole("paragraph")
    .filter({ hasText: `You are offline. Showing data last updated ${when}.` });
  await expect.element(banner).toBeVisible();
  await expect
    .poll(() => page.getByRole("status").element().textContent)
    .toBe(`You are offline. Showing data last updated ${when}.`);
  await expectNoAxeViolations(document.body);
  // Nothing refreshes while offline, not even by hand.
  await refreshButton().click();
  expect(refreshes()).toBe(1);

  online.set(true);
  await settle();

  expect(refreshes()).toBe(2);
  await expect.element(banner).not.toBeInTheDocument();
});

test("the quota popover lists each pool and the guard, with keyboard support", async () => {
  const { time, rateLimits, scheduler } = await setup();
  const resetAt = new Date(time.clock.now().getTime() + 21 * MINUTE);
  rateLimits.set("graphql", { limit: 5000, remaining: 750, resetAt, lastCost: 1 });
  rateLimits.set("core", { limit: 5000, remaining: 4388, resetAt, lastCost: null });
  rateLimits.set("search", {
    limit: 30,
    remaining: 26,
    resetAt: new Date(time.clock.now().getTime() + 30_000),
    lastCost: null,
  });
  await scheduler.refreshNow();

  const button = page.getByRole("button", { name: "API quota: 750 left" });
  await expect.element(button).toHaveAttribute("aria-expanded", "false");
  button.element().focus();
  await userEvent.keyboard("{Enter}");

  const popover = page.getByRole("group", { name: "API quota", includeHidden: true });
  await expect.element(popover).toBeVisible();
  await expect.element(button).toHaveAttribute("aria-expanded", "true");
  const at = new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(resetAt);
  expect(popover.element().textContent).toContain("GraphQL API750 / 5,000Hourly limit");
  expect(popover.element().textContent).toContain(`Resets in 21 min · ${at}`);
  expect(popover.element().textContent).toContain("REST API4,388 / 5,000");
  expect(popover.element().textContent).toContain("Search API26 / 30Per-minute limit");
  expect(popover.element().textContent).toContain("Resets in < 1 min");
  expect(popover.element().textContent).toContain("octo-fixture");
  expect(popover.element().textContent).toContain(
    "Auto-refresh slows down below 20% and pauses below 5% until the reset.",
  );
  await expectNoAxeViolations(document.body);

  await userEvent.keyboard("{Escape}");
  await expect.element(popover).not.toBeVisible();
  expect(document.activeElement).toBe(button.element());

  await button.click();
  await expect.element(popover).toBeVisible();
  // Focus moving on (here to the refresh button) closes it.
  await userEvent.tab();
  await expect.element(refreshButton()).toHaveFocus();
  await expect.element(popover).not.toBeVisible();
});

test("before any request the quota says so, and the critical level shows in the button", async () => {
  const { time, rateLimits, scheduler } = await setup();
  const button = page.getByRole("button", { name: "API quota: –" });
  await button.click();
  await expect.element(page.getByText("No requests made yet.")).toBeVisible();
  await expectNoAxeViolations(document.body);

  rateLimits.set("graphql", {
    limit: 5000,
    remaining: 120,
    resetAt: new Date(time.clock.now().getTime() + 30 * MINUTE),
    lastCost: 1,
  });
  await scheduler.refreshNow();

  await expect
    .element(page.getByRole("button", { name: "API quota: 120 left" }))
    .toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector(".quota")?.getAttribute("data-level")).toBe("critical");
  await expectNoAxeViolations(document.body);
});

test("at 320 px the header still fits, and the buttons keep their full names", async () => {
  await setup({ width: 320 });

  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
  await expect.element(refreshButton()).toHaveAccessibleName("Refresh, Updated just now");
  await expect.element(page.getByRole("button", { name: "API quota: –" })).toBeVisible();
  await expectNoAxeViolations(document.body);
});
