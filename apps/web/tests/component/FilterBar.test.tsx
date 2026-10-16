import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { userEvent } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { useI18n } from "../../src/application/i18n.tsx";
import { applyPrFilters, usePrFilters } from "../../src/application/pr-filters.ts";
import { defaultPreferences } from "../../src/application/preferences.ts";
import { usePreferences } from "../../src/application/preferences-provider.tsx";
import { FilterBar } from "../../src/ui/pr/FilterBar.tsx";
import { PrList } from "../../src/ui/pr/PrList.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { renderWithProviders } from "../render.tsx";

/**
 * A harness route rather than the app's route tree: no production route uses the filters
 * yet (T20/T21 will). It composes them the way a feature will: the URL holds the filters,
 * preferences give the density, the pure apply function gives the rows.
 */

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const now = new Date("2026-10-30T00:00:00Z");
const prs = [
  aPullRequest({ id: "a", number: 1, title: "Fix date picker", labels: ["bug"], additions: 50 }),
  aPullRequest({ id: "b", number: 2, title: "Draft billing", isDraft: true, additions: 5 }),
  aPullRequest({ id: "c", number: 3, title: "Docs", labels: ["docs"], additions: 1 }),
];

function Harness() {
  const { t, format } = useI18n();
  const { density } = usePreferences().preferences;
  const { filters, update, reset } = usePrFilters();
  const labels = [...new Set(prs.flatMap((p) => p.labels))].map((name) => ({
    name,
    count: prs.filter((p) => p.labels.includes(name)).length,
  }));
  return (
    <>
      <FilterBar t={t} filters={filters} labels={labels} onChange={update} onReset={reset} />
      <PrList
        t={t}
        format={format}
        now={now}
        density={density}
        showRepository
        label="Pull requests"
        rows={applyPrFilters(prs, filters, { viewerLogin: "me", now }).map((pr) => ({
          pr,
          reason: null,
          newCount: null,
          href: `/pull/${pr.number}`,
        }))}
      />
    </>
  );
}

async function renderAt(path: string, density: "comfortable" | "compact" = "comfortable") {
  const router = createRouter({
    routeTree: createRootRoute({ component: Harness }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const preferencesStore = createInMemoryPreferencesStore({ ...defaultPreferences, density });
  const screen = await renderWithProviders(<RouterProvider router={router} />, {
    preferencesStore,
  });
  return { screen, router };
}

const titles = (screen: Awaited<ReturnType<typeof renderAt>>["screen"]) =>
  screen
    .getByRole("listitem")
    .elements()
    .map((li) => li.querySelector(".pr-title")?.textContent);

test("filters and sort survive a reload via the URL; Reset restores the defaults (AC-5.5)", async () => {
  const first = await renderAt("/");
  const { screen } = first;

  // Sort by keyboard: the menu button pattern.
  const sort = screen.getByRole("button", { name: "Sort by Waiting longest" });
  await sort.click();
  await expect
    .element(screen.getByRole("menuitemradio", { name: "Waiting longest" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "Sort by Smallest first" }))
    .toHaveFocus();

  await screen.getByRole("switch", { name: "Drafts" }).click();
  await screen.getByRole("button", { name: "Label" }).click();
  await screen.getByRole("menuitemcheckbox", { name: /bug/ }).click();
  await screen.getByRole("menuitemcheckbox", { name: /docs/ }).click();
  await userEvent.keyboard("{Escape}");
  await screen.getByRole("searchbox", { name: "Filter pull requests" }).fill("c");

  await expect.poll(() => titles(screen)).toEqual(["Docs", "Fix date picker"]);
  expect(first.router.state.location.search).toEqual({
    q: "c",
    label: ["bug", "docs"],
    drafts: false,
    sort: "smallest",
  });

  // A reload: a fresh router and tree on the same URL.
  const href = first.router.state.location.href;
  await screen.unmount();
  const second = await renderAt(href);
  const again = second.screen;
  await expect.element(again.getByRole("searchbox")).toHaveValue("c");
  await expect.element(again.getByRole("switch", { name: "Drafts" })).not.toBeChecked();
  await expect.element(again.getByRole("button", { name: "Sort by Smallest first" })).toBeVisible();
  await expect.element(again.getByRole("button", { name: "Label: 2 selected" })).toBeVisible();
  expect(titles(again)).toEqual(["Docs", "Fix date picker"]);

  await again.getByRole("button", { name: "Reset" }).click();

  await expect.poll(() => second.router.state.location.search).toEqual({});
  await expect.element(again.getByRole("searchbox")).toHaveValue("");
  await expect.element(again.getByRole("switch", { name: "Drafts" })).toBeChecked();
  await expect
    .element(again.getByRole("button", { name: "Sort by Waiting longest" }))
    .toBeVisible();
  await expect.element(again.getByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  expect(titles(again)).toHaveLength(3);
});

test("the updated menu offers stale and filters by it", async () => {
  const { screen, router } = await renderAt("/");

  await screen.getByRole("button", { name: "Updated: any time" }).click();
  await expect.element(screen.getByRole("menuitemradio", { name: "Any time" })).toBeChecked();
  await screen.getByRole("menuitemradio", { name: "Stale (14d+ inactive)" }).click();

  await expect.poll(() => router.state.location.search).toEqual({ updated: "stale" });
  await expect.element(screen.getByRole("button", { name: "Stale (14d+ inactive)" })).toHaveFocus();
});

test("a bad URL falls back to the defaults field by field", async () => {
  const { screen } = await renderAt('/?q=date&sort="bogus"&updated=7&drafts="maybe"');

  await expect.element(screen.getByRole("searchbox")).toHaveValue("date");
  await expect
    .element(screen.getByRole("button", { name: "Sort by Waiting longest" }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Updated: any time" })).toBeVisible();
  await expect.element(screen.getByRole("switch", { name: "Drafts" })).toBeChecked();
  expect(titles(screen)).toEqual(["Fix date picker"]);
});

test.each(["comfortable", "compact"] as const)(
  "the filter bar, an open menu and the list have no axe violations (%s)",
  async (density) => {
    const { screen } = await renderAt("/?label=%5B%22bug%22%5D", density);
    await screen.getByRole("button", { name: /Label/ }).click();
    await expect.element(screen.getByRole("menu")).toBeVisible();

    await expectNoAxeViolations(screen.container);
  },
);
