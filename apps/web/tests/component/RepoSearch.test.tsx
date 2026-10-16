import { afterEach, expect, test } from "vitest";
import { expectNoAxeViolations } from "../axe.ts";
import { loadRealStyles, renderSidebar } from "../sidebar.tsx";

loadRealStyles();
afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const REPOS = ["auth-team/login", "acme/user-service", "acme/billing", "octo/auth-api"];

async function setup() {
  const app = await renderSidebar({ repositories: REPOS });
  const { screen } = app;
  const sidebar = screen.getByRole("complementary");
  const input = sidebar.getByRole("searchbox", { name: "Search repositories" });
  await expect.element(sidebar.getByRole("link", { name: "billing" })).toBeInTheDocument();
  const visible = () =>
    sidebar
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("href"))
      .filter((href) => href?.startsWith("/repo/"));
  return { ...app, sidebar, input, visible };
}

test("^auth|service$ lists only repositories whose owner/name matches (AC-4.2)", async () => {
  const { sidebar, input, visible, calls } = await setup();

  await input.fill("^auth|service$");

  await expect.element(sidebar.getByText("2 matches · regex")).toBeInTheDocument();
  // `^` anchors at the owner: octo/auth-api does not match.
  expect(visible()).toEqual(["/repo/auth-team/login", "/repo/acme/user-service"]);
  // Typing filters the cached list: GitHub was asked once, on load.
  expect(calls.listRepos).toBe(1);
});

test("( shows the invalid-regex message and matches as text (AC-4.2)", async () => {
  const { sidebar, input, visible } = await setup();

  await input.fill("(");

  await expect
    .element(sidebar.getByText("Invalid regular expression, matching as plain text"))
    .toBeInTheDocument();
  await expect.element(input).toHaveAttribute("aria-invalid", "true");
  await expect.element(sidebar.getByText("No repositories match.")).toBeInTheDocument();
  expect(visible()).toEqual([]);
  await expectNoAxeViolations(sidebar.element());
});

test("plain text is a substring search, and clearing it shows everything again", async () => {
  const { sidebar, input, visible } = await setup();

  await input.fill("BILL");
  await expect.element(sidebar.getByText("1 matches")).toBeInTheDocument();
  expect(visible()).toEqual(["/repo/acme/billing"]);

  await input.fill("");
  await expect.poll(() => visible().length).toBe(REPOS.length);
});

test("a pattern that could backtrack catastrophically is refused, not run", async () => {
  const { sidebar, input } = await setup();

  await input.fill("(a+)+$");

  await expect
    .element(sidebar.getByText("Pattern too complex to run safely, matching as plain text"))
    .toBeInTheDocument();
});

test("the input is capped at 200 characters", async () => {
  const { input } = await setup();

  await input.fill("a".repeat(250));

  expect((input.element() as HTMLInputElement).value).toHaveLength(200);
});
