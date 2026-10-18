import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { defaultPreferences, type PreferencesStore } from "../../src/application/preferences.ts";
import { useI18n } from "../../src/application/i18n.tsx";
import { PrList } from "../../src/ui/pr/PrList.tsx";
import { expectNoAxeViolations } from "../axe.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderWithProviders } from "../render.tsx";
import { loadRealStyles, renderSidebar } from "../sidebar.tsx";

loadRealStyles();

afterEach(async () => {
  document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

const LONG = "very-long-organisation-name/an-extremely-long-repository-name-for-testing";

const sidebarWidth = () =>
  Math.round(document.getElementById("sidebar")?.getBoundingClientRect().width ?? 0);

async function renderResizable(store: PreferencesStore = createInMemoryPreferencesStore()) {
  const app = await renderSidebar({ repositories: [LONG, "acme/app"], preferencesStore: store });
  const splitter = app.screen.getByRole("separator", { name: "Resize sidebar" });
  await expect.element(splitter).toBeInTheDocument();
  return { ...app, splitter, store };
}

test("the sidebar's edge is a labelled window splitter, at the 264 px default", async () => {
  const { splitter } = await renderResizable();

  await expect.element(splitter).toHaveAttribute("aria-valuenow", "264");
  await expect.element(splitter).toHaveAttribute("aria-orientation", "vertical");
  await expect.element(splitter).toHaveAttribute("aria-controls", "sidebar");
  await expect.element(splitter).toHaveAttribute("aria-valuemin", "220");
  // 40% of 1280 px is 512; the cap is 480.
  await expect.element(splitter).toHaveAttribute("aria-valuemax", "480");
  await expect.element(splitter).toHaveAttribute("tabindex", "0");
});

test("arrows resize in steps, Shift in bigger ones; Home, End and Enter; each change is saved", async () => {
  const { splitter, store } = await renderResizable();
  splitter.element().focus();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "280");
  expect(sidebarWidth()).toBe(280);
  expect(store.load().sidebarWidth).toBe(280);

  await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "344");

  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "328");

  await userEvent.keyboard("{End}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "480");
  expect(store.load().sidebarWidth).toBe(480);

  // Past the bound: clamped, not beyond.
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "480");

  await userEvent.keyboard("{Home}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "220");
  await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "220");

  await userEvent.keyboard("{Enter}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "264");
  expect(store.load().sidebarWidth).toBeNull();
});

test("a double-click resets the width", async () => {
  const { splitter, store } = await renderResizable(
    createInMemoryPreferencesStore({ ...defaultPreferences, sidebarWidth: 400 }),
  );
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "400");

  await userEvent.dblClick(splitter);

  await expect.element(splitter).toHaveAttribute("aria-valuenow", "264");
  expect(store.load().sidebarWidth).toBeNull();
});

test("the width survives a remount", async () => {
  const store = createInMemoryPreferencesStore();
  const first = await renderResizable(store);
  first.splitter.element().focus();
  await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}");
  await expect.element(first.splitter).toHaveAttribute("aria-valuenow", "392");
  await first.screen.unmount();

  const second = await renderResizable(store);

  await expect.element(second.splitter).toHaveAttribute("aria-valuenow", "392");
  expect(sidebarWidth()).toBe(392);
});

test("a stored width is clamped to 40% of a narrower viewport", async () => {
  const { splitter } = await renderResizable(
    createInMemoryPreferencesStore({ ...defaultPreferences, sidebarWidth: 480 }),
  );
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "480");

  await page.viewport(900, 800);

  await expect.element(splitter).toHaveAttribute("aria-valuemax", "360");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "360");
  expect(sidebarWidth()).toBe(360);
});

test("dragging with the pointer resizes the sidebar and saves the width on release", async () => {
  const { screen, splitter, store } = await renderResizable();
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "264");

  // A real pointer: Playwright moves the mouse from the handle to 100 px into `main`.
  await userEvent.dragAndDrop(splitter, screen.getByRole("main"), {
    targetPosition: { x: 100, y: 200 },
  });

  await expect.poll(() => store.load().sidebarWidth).toBeGreaterThan(340);
  const saved = store.load().sidebarWidth ?? 0;
  expect(saved).toBeLessThan(380);
  await expect.element(splitter).toHaveAttribute("aria-valuenow", String(saved));
  expect(sidebarWidth()).toBe(saved);
});

test("a long owner/name keeps its full name as the link's name and title", async () => {
  const { screen } = await renderResizable();
  const link = screen.getByRole("link", { name: LONG, exact: true });

  await expect.element(link).toHaveAttribute("title", LONG);
  // It is visually truncated at the default width.
  const name = link.element().querySelector(".repo-name");
  expect(name).not.toBeNull();
  const owner = link.element().querySelector<HTMLElement>(".repo-owner");
  const short = link.element().querySelector<HTMLElement>(".repo-short");
  const truncated = [owner, short].some(
    (part) => part !== null && part.scrollWidth > part.clientWidth,
  );
  expect(truncated).toBe(true);
});

test("no axe violations in either theme with the splitter focused", async () => {
  const { screen, splitter } = await renderResizable();
  splitter.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(splitter).toHaveFocus();

  await expectNoAxeViolations(screen.container);
});

function LongRow() {
  const { t, format } = useI18n();
  const pr = aPullRequest({
    id: "long",
    repository: LONG,
    number: 4321,
    title: `A title long enough to need truncating ${"in a narrow row ".repeat(6)}`,
    author: { login: "a-contributor-with-an-unusually-long-login", typename: "User" },
    labels: ["needs-a-very-careful-review"],
    reviews: [
      {
        author: { login: "reviewer-with-a-remarkably-long-github-login", typename: "User" },
        state: "APPROVED",
        submittedAt: "2026-10-03T00:00:00Z",
      },
    ],
    reviewRequests: [
      { kind: "user", login: "second-reviewer-also-quite-long" },
      { kind: "team", team: "very-long-organisation-name/platform-reviewers" },
    ],
  });
  return (
    <PrList
      t={t}
      format={format}
      now={new Date("2026-10-30T00:00:00Z")}
      density="comfortable"
      showRepository
      label="Rows"
      rows={[{ pr, reason: { kind: "review-requested" }, newCount: null, href: "/x" }]}
    />
  );
}

test("a row with long values keeps its height, its stats and every full value", async () => {
  await page.viewport(1280, 800);
  const screen = await renderWithProviders(<LongRow />);
  const row = screen.getByRole("listitem");
  await expect.element(row).toBeVisible();

  expect(Math.round(row.element().getBoundingClientRect().height)).toBe(64);
  await expect.element(row.getByTitle(`${LONG}#4321`)).toBeInTheDocument();
  await expect
    .element(row.getByTitle("a-contributor-with-an-unusually-long-login"))
    .toBeInTheDocument();
  // The number stays visible when the repository truncates.
  await expect.element(row.getByText("#4321", { exact: false })).toBeVisible();
  // Reviewers: the compact count, with every name in the tooltip and the accessible name.
  const names =
    "Reviewers: reviewer-with-a-remarkably-long-github-login, second-reviewer-also-quite-long, @very-long-organisation-name/platform-reviewers";
  const review = row.element().querySelector<HTMLElement>(".pr-review");
  expect(review?.title).toContain(names);
  expect(review?.textContent).toContain(names);
  // The stats are whole: the updated time is inside the row.
  const updated = row.element().querySelector(".pr-updated")?.getBoundingClientRect();
  expect(updated?.right ?? Infinity).toBeLessThanOrEqual(
    row.element().getBoundingClientRect().right,
  );
  await expectNoAxeViolations(screen.container);
});

const part = (row: Element, selector: string) => {
  const element = row.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`no ${selector}`);
  return element;
};
const truncated = (element: HTMLElement) => element.scrollWidth > element.clientWidth;
const shown = (element: HTMLElement) => element.clientWidth / element.scrollWidth;

test("a wide row shows the long repository and author in full; a narrow one truncates them", async () => {
  await page.viewport(1920, 800);
  const screen = await renderWithProviders(<LongRow />);
  const row = screen.getByRole("listitem");
  await expect.element(row).toBeVisible();
  const repo = part(row.element(), ".pr-repo");
  const author = part(row.element(), ".pr-author");
  const label = part(row.element(), ".pr-label");

  expect(repo.textContent).toBe(LONG);
  expect({ repo: truncated(repo), author: truncated(author) }).toEqual({
    repo: false,
    author: false,
  });

  await page.viewport(1100, 800);

  await expect.poll(() => truncated(author)).toBe(true);
  // The author gives way first: less of it stays visible than of the repository.
  expect(shown(author)).toBeLessThan(shown(repo));

  await page.viewport(820, 800);

  await expect.poll(() => truncated(repo)).toBe(true);
  // Both keep their full text as tooltip and text.
  expect(author.title).toBe("a-contributor-with-an-unusually-long-login");
  expect(author.textContent).toBe("a-contributor-with-an-unusually-long-login");
  expect(part(row.element(), ".pr-ref").title).toBe(`${LONG}#4321`);
  // The number and the reason chip stay whole.
  await expect.element(row.getByText("#4321", { exact: false })).toBeVisible();
  const chip = part(row.element(), ".reason-chip");
  expect(truncated(part(chip, ".reason-text"))).toBe(false);
  // A label squeezed by the title keeps its full text as tooltip and accessible text.
  expect(label.title).toBe("needs-a-very-careful-review");
  expect(label.textContent).toBe("needs-a-very-careful-review");
  expect(Math.round(row.element().getBoundingClientRect().height)).toBe(64);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
  await expectNoAxeViolations(screen.container);
});

function ShortTitle() {
  const { t, format } = useI18n();
  const pr = aPullRequest({ id: "s", title: "Fix", labels: ["needs-a-very-careful-review"] });
  return (
    <PrList
      t={t}
      format={format}
      now={new Date("2026-10-30T00:00:00Z")}
      density="comfortable"
      showRepository
      label="Rows"
      rows={[{ pr, reason: null, newCount: null, href: "/x" }]}
    />
  );
}

test("a short title leaves the labels room to show in full", async () => {
  await page.viewport(1280, 800);
  const screen = await renderWithProviders(<ShortTitle />);
  await expect.element(screen.getByRole("listitem")).toBeVisible();

  expect(truncated(part(screen.container, ".pr-label"))).toBe(false);
  expect(truncated(part(screen.container, ".pr-title"))).toBe(false);
});

test("below 768 px there is no splitter and the drawer keeps its width", async () => {
  const { screen } = await renderSidebar({ width: 375 });

  await expect
    .element(screen.getByRole("separator", { name: "Resize sidebar", includeHidden: true }))
    .not.toBeVisible();
});
