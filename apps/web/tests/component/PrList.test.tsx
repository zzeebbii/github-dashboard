import { afterEach, expect, test } from "vitest";
import { useI18n } from "../../src/application/i18n.tsx";
import type { Density } from "../../src/application/preferences.ts";
import { PrList } from "../../src/ui/pr/PrList.tsx";
import type { PrRowData } from "../../src/ui/pr/PrRow.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderWithProviders } from "../render.tsx";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.scrollTo(0, 0);
});

const now = new Date("2026-10-30T00:00:00Z");

const rows: readonly PrRowData[] = Array.from({ length: 500 }, (_, i) => ({
  pr: aPullRequest({ id: `PR_${i + 1}`, number: i + 1, title: `Change ${i + 1}` }),
  reason: null,
  newCount: null,
  href: `/repo/acme/app/pull/${i + 1}`,
}));

function List({ density, list = rows }: { density: Density; list?: readonly PrRowData[] }) {
  const { t, format } = useI18n();
  return (
    <PrList
      t={t}
      format={format}
      now={now}
      density={density}
      showRepository
      label="Pull requests"
      rows={list}
    />
  );
}

const rendered = () => document.querySelectorAll(".pr-list > li");

test.each(["comfortable", "compact"] as const)(
  "500 rows render and scroll without all being in the DOM (%s)",
  async (density) => {
    const screen = await renderWithProviders(<List density={density} />);
    await expect.element(screen.getByRole("link", { name: "Open Change 1" })).toBeVisible();

    expect(rendered().length).toBeGreaterThan(0);
    expect(rendered().length).toBeLessThan(100);
    const list = screen.getByRole("list", { name: "Pull requests" }).element();
    const rowHeight = rendered()[0]?.getBoundingClientRect().height ?? 0;
    // The padding keeps the full scroll height, so the scrollbar is honest.
    expect(list.getBoundingClientRect().height).toBeCloseTo(rowHeight * 500, -1);

    window.scrollTo(0, list.getBoundingClientRect().top + window.scrollY + rowHeight * 300);

    await expect.element(screen.getByRole("link", { name: "Open Change 301" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Change 1", exact: true }).query()).toBeNull();
    expect(rendered().length).toBeLessThan(100);
    const item = screen.getByRole("listitem").filter({ hasText: "Change 301" }).element();
    expect(item.getAttribute("aria-posinset")).toBe("301");
    expect(item.getAttribute("aria-setsize")).toBe("500");
  },
);

test("an empty list says so", async () => {
  const screen = await renderWithProviders(<List density="comfortable" list={[]} />);
  await expect.element(screen.getByText("No pull requests match.")).toBeVisible();
});

test.each(["comfortable", "compact"] as const)(
  "the list has no axe violations in either theme (%s)",
  async (density) => {
    const screen = await renderWithProviders(<List density={density} />);
    await expect.element(screen.getByRole("link", { name: "Open Change 1" })).toBeVisible();

    await expectNoAxeViolations(screen.container);
  },
);
