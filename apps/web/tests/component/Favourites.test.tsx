import { afterEach, expect, test } from "vitest";
import { expectNoAxeViolations } from "../axe.ts";
import { favourite, loadRealStyles, renderSidebar } from "../sidebar.tsx";

loadRealStyles();
afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const REPOS = ["acme/app", "acme/billing", "octo/tools"];

test("favouriting moves a repository to Favourites with its open PRs; un-favouriting removes it (AC-4.3)", async () => {
  const { screen, calls, accountStore, accountId } = await renderSidebar({
    repositories: REPOS,
    openCounts: { "R_acme/billing": 3 },
  });
  const favourites = screen.getByRole("region", { name: "Favorites" });
  const repositories = screen.getByRole("region", { name: "Repositories" });
  await expect.element(favourites.getByText("Star a repository to add it here.")).toBeVisible();
  const star = repositories.getByRole("button", { name: "Favorite acme/billing" });
  await expect.element(star).toHaveAttribute("aria-pressed", "false");

  await star.click();

  await expect.element(star).toHaveAttribute("aria-pressed", "true");
  // The live count arrives with the next favourites refresh, which ran at once.
  await expect
    .element(favourites.getByRole("link", { name: "acme/billing 3 open pull requests" }))
    .toBeVisible();
  expect(calls.refreshFavourites).toBe(1);
  expect(accountStore.favourites(accountId)).toEqual([favourite("acme/billing")]);
  await expectNoAxeViolations(screen.getByRole("complementary").element());

  await favourites.getByRole("button", { name: "Favorite acme/billing" }).click();

  await expect.element(favourites.getByText("Star a repository to add it here.")).toBeVisible();
  await expect.element(star).toHaveAttribute("aria-pressed", "false");
  expect(accountStore.favourites(accountId)).toEqual([]);
});

test("an unavailable favourite is marked and can be removed (FR-4.7)", async () => {
  const { screen, accountStore, accountId } = await renderSidebar({
    repositories: REPOS,
    favourites: [favourite("acme/gone"), favourite("acme/app")],
    openCounts: { "R_acme/app": 0 },
  });
  const favourites = screen.getByRole("region", { name: "Favorites" });

  await expect.element(favourites.getByText("Unavailable")).toBeVisible();
  await expect.element(favourites.getByText("acme/gone")).toBeVisible();
  await expect
    .element(favourites.getByRole("link", { name: "acme/app 0 open pull requests" }))
    .toBeVisible();

  await favourites.getByRole("button", { name: "Remove acme/gone from favorites" }).click();

  await expect.element(favourites.getByText("acme/gone")).not.toBeInTheDocument();
  expect(accountStore.favourites(accountId)).toEqual([favourite("acme/app")]);
});

test("more than 50 favourites show the refresh cost notice (FR-4.8)", async () => {
  const many = Array.from({ length: 51 }, (_, i) => favourite(`acme/repo-${i}`));
  const { screen } = await renderSidebar({ favourites: many });

  await expect
    .element(screen.getByText("51 favorites: each refresh uses 3 requests of your API quota."))
    .toBeVisible();
});

test("repositories are one flat list of owner/name links, A–Z ignoring case (FR-4.2)", async () => {
  const { screen } = await renderSidebar({
    repositories: ["octo/tools", "acme/billing", "Beta/app"],
  });
  const repositories = screen.getByRole("region", { name: "Repositories" });
  await expect.element(repositories.getByRole("link", { name: "octo/tools" })).toBeVisible();

  const links = repositories.getByRole("link").elements();
  expect(links.map((link) => link.textContent)).toEqual(["acme/billing", "Beta/app", "octo/tools"]);
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/repo/acme/billing",
    "/repo/Beta/app",
    "/repo/octo/tools",
  ]);
  // Flat: no owner headings or disclosure buttons, every row is in one list.
  expect(repositories.element().querySelectorAll("[aria-expanded], h3")).toHaveLength(0);
  expect(repositories.getByRole("list").elements()).toHaveLength(1);
  await expectNoAxeViolations(screen.getByRole("complementary").element());
});

test("a repository link navigates within the app to /repo/$owner/$name", async () => {
  const { screen, router } = await renderSidebar({ repositories: REPOS });
  const marker = Symbol("no reload");
  const before = window.history.length;
  Object.assign(window, { [marker]: true });

  await screen.getByRole("complementary").getByRole("link", { name: "acme/billing" }).click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "acme / billing" }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe("/repo/acme/billing");
  // Same document: a full reload would have dropped the marker.
  expect(marker in window).toBe(true);
  expect(window.history.length).toBe(before);
  await expect
    .element(screen.getByRole("complementary").getByRole("link", { name: "acme/billing" }))
    .toHaveAttribute("aria-current", "page");
});

test("refresh repositories asks GitHub again, the only way within 24 hours (AC-4.1)", async () => {
  const { screen, calls } = await renderSidebar({ repositories: REPOS });
  await expect.element(screen.getByRole("link", { name: "acme/billing" })).toBeVisible();
  expect(calls.listRepos).toBe(1);

  await screen.getByRole("button", { name: "Refresh repositories" }).click();

  await expect.poll(() => calls.listRepos).toBe(2);
});
