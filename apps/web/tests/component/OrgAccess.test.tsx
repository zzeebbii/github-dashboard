import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { expectNoAxeViolations } from "../axe.ts";
import { favourite, loadRealStyles, renderSidebar, ssoIssue } from "../sidebar.tsx";

loadRealStyles();
afterEach(async () => {
  document.documentElement.classList.remove("dark");
  await page.viewport(1280, 800);
});

const REPOS = ["acme/app", "acme/billing", "octo/tools"];
const ISSUES = [
  ssoIssue("sso-corp"),
  { org: null, reason: "appNotInstalled", fixUrl: "https://github.com/apps/ghd/installations/new" },
] as const;

test("an SSO organisation shows the reason and a Fix access link; the rest still renders (FR-3.10)", async () => {
  const { screen } = await renderSidebar({ repositories: REPOS, orgIssues: ISSUES });
  const notice = screen.getByRole("region", { name: "Some organizations are hidden" });

  await expect.element(notice.getByText("sso-corp")).toBeVisible();
  await expect
    .element(notice.getByText("Needs SAML single sign-on authorization for this token"))
    .toBeVisible();
  const fix = notice.getByRole("link", { name: "Fix access to sso-corp (opens in a new tab)" });
  await expect.element(fix).toHaveAttribute("href", "https://github.com/orgs/sso-corp/sso");
  await expect.element(fix).toHaveAttribute("target", "_blank");
  await expect.element(fix).toHaveAttribute("rel", "noopener noreferrer");
  // GitHub did not say which organisation the app is missing from.
  await expect.element(notice.getByText("An organization")).toBeVisible();
  await expect.element(notice.getByText("The GitHub App is not installed here")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "acme/billing" })).toBeVisible();

  await expectNoAxeViolations(screen.getByRole("complementary").element());
});

test("the whole section, with notices, favourites and the flat list, passes axe in both themes", async () => {
  const { screen } = await renderSidebar({
    repositories: REPOS,
    favourites: [favourite("acme/app"), favourite("acme/gone")],
    openCounts: { "R_acme/app": 2 },
    orgIssues: ISSUES,
  });
  const sidebar = screen.getByRole("complementary");
  await expect.element(sidebar.getByText("Unavailable")).toBeVisible();
  await sidebar.getByRole("searchbox").fill("(");
  await expect.element(sidebar.getByText(/Invalid regular expression/)).toBeVisible();
  await expectNoAxeViolations(sidebar.element());

  await sidebar.getByRole("searchbox").fill("");
  await expect.element(sidebar.getByRole("link", { name: "octo/tools" })).toBeVisible();
  await expectNoAxeViolations(sidebar.element());
});

test("below 768 px the section works in the drawer, and following a repository closes it", async () => {
  const { screen, router } = await renderSidebar({
    repositories: REPOS,
    orgIssues: [ssoIssue("sso-corp")],
    width: 320,
  });

  await screen.getByRole("button", { name: "Open menu" }).click();
  const drawer = screen.getByRole("dialog", { name: "Main navigation" });
  await expect.element(drawer.getByRole("region", { name: "Repositories" })).toBeVisible();
  await expect.element(drawer.getByRole("link", { name: /Fix access to sso-corp/ })).toBeVisible();
  await expectNoAxeViolations(drawer.element());

  await drawer.getByRole("searchbox", { name: "Search repositories" }).fill("tool");
  await expect.element(drawer.getByText("1 match")).toBeVisible();
  await expect.element(drawer.getByRole("link", { name: "acme/billing" })).not.toBeInTheDocument();
  // Starring is a button, not a link: the drawer stays open.
  const repositories = drawer.getByRole("region", { name: "Repositories" });
  const star = repositories.getByRole("button", { name: "Favorite octo/tools" });
  await star.click();
  await expect.element(star).toHaveAttribute("aria-pressed", "true");
  await expect.element(drawer).toBeVisible();
  await star.click();
  await expect.element(star).toHaveAttribute("aria-pressed", "false");

  await repositories.getByRole("link", { name: "octo/tools" }).click();

  await expect.element(drawer).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/repo/octo/tools");
});
