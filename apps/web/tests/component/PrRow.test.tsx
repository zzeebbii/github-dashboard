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
});

const now = new Date("2026-10-30T00:00:00Z");

const rows: readonly PrRowData[] = [
  {
    pr: aPullRequest({
      id: "a",
      title: "Fix date picker locale fallback",
      number: 1290,
      labels: ["bug"],
      commentCount: 5,
      checkState: "FAILURE",
      reviewDecision: "CHANGES_REQUESTED",
      mergeable: "CONFLICTING",
      additions: 34,
      deletions: 8,
    }),
    reason: { kind: "changes-requested" },
    newCount: 2,
    href: "/repo/acme/app/pull/1290",
  },
  {
    pr: aPullRequest({
      id: "b",
      // GitHub content is text: markup in a title must never become DOM.
      title: '<img src=x onerror="alert(1)"> Draft work',
      isDraft: true,
      author: { login: "renovate[bot]", typename: "Bot" },
      checkState: "PENDING",
      reviews: [
        {
          author: { login: "bob", typename: "User" },
          state: "APPROVED",
          submittedAt: "2026-10-03T00:00:00Z",
        },
      ],
      reviewRequests: [{ kind: "user", login: "carol" }],
    }),
    reason: { kind: "team-requested", team: "acme/platform" },
    newCount: null,
    href: "/repo/acme/app/pull/1",
  },
];

function Rows({ density, list = rows }: { density: Density; list?: readonly PrRowData[] }) {
  const { t, format } = useI18n();
  return (
    <PrList
      t={t}
      format={format}
      now={now}
      density={density}
      showRepository
      label="Needs your review"
      rows={list}
    />
  );
}

test("each row's link names its status before its title (AC-5.6)", async () => {
  const screen = await renderWithProviders(<Rows density="comfortable" />);

  await expect
    .element(screen.getByRole("link", { name: "Open Fix date picker locale fallback" }))
    .toHaveAttribute("href", "/repo/acme/app/pull/1290");
  await expect
    .element(screen.getByRole("link", { name: 'Draft <img src=x onerror="alert(1)"> Draft work' }))
    .toBeVisible();
  // The status is visible text too, not colour alone.
  await expect.element(screen.getByText("Draft", { exact: true })).toBeVisible();
  expect(screen.container.querySelector("img")).toBeNull();
});

test("a row shows the reason chip, +N new and the list fields", async () => {
  const screen = await renderWithProviders(<Rows density="comfortable" />);
  const first = screen.getByRole("listitem").first();

  await expect.element(first.getByText("Changes requested", { exact: true }).first()).toBeVisible();
  await expect.element(first.getByText("+2 new")).toBeVisible();
  await expect.element(first.getByText("bug")).toBeVisible();
  await expect.element(first.getByText("acme/app#1290")).toBeVisible();
  await expect.element(first.getByText("Conflicts")).toBeVisible();
  await expect.element(first.getByRole("img", { name: "Checks failing" })).toBeInTheDocument();
  await expect
    .element(first.getByRole("link", { name: "Open in GitHub" }))
    .toHaveAttribute("href", "https://github.com/acme/app/pull/1");

  const second = screen.getByRole("listitem").nth(1);
  await expect.element(second.getByText("Team @acme/platform")).toBeVisible();
  await expect.element(second.getByText("1/2")).toBeVisible();
  await expect.element(second.getByRole("img", { name: "Checks running" })).toBeInTheDocument();
  await expect.element(second.getByText("renovate[bot]")).toBeVisible();
});

test("a row never links a non-GitHub URL", async () => {
  const unsafe = {
    pr: aPullRequest({ url: "javascript:alert(1)" }),
    reason: null,
    newCount: 0,
    href: "/x",
  };
  const screen = await renderWithProviders(<Rows density="compact" list={[unsafe]} />);

  await expect.element(screen.getByRole("link", { name: "Open A change" })).toBeVisible();
  expect(screen.container.querySelector('a[href^="javascript"]')).toBeNull();
});

test.each(["comfortable", "compact"] as const)(
  "rows have no axe violations in either theme (%s)",
  async (density) => {
    const screen = await renderWithProviders(<Rows density={density} />);
    await expect.element(screen.getByRole("list")).toBeVisible();

    await expectNoAxeViolations(screen.container);
  },
);
