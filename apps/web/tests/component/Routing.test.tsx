import { expect, test } from "vitest";
import { renderApp } from "../render.tsx";

const heading = (name: string) => ({ level: 1, name }) as const;

test("/repo/a/b then Back returns to / (AC-1.6)", async () => {
  const { screen, router } = await renderApp("/");
  await expect.element(screen.getByRole("heading", heading("GitHub Dashboard"))).toBeVisible();

  await router.navigate({ to: "/repo/$owner/$name", params: { owner: "a", name: "b" } });
  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();

  router.history.back();
  await expect.element(screen.getByRole("heading", heading("GitHub Dashboard"))).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
});

test("loading /repo/a/b directly renders the repo route (AC-1.6)", async () => {
  const { screen } = await renderApp("/repo/a/b");

  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();
});

test("the PR route opens a panel over the repo page and Back closes it (FR-1.6)", async () => {
  const { screen, router } = await renderApp("/repo/a/b");
  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();

  await router.navigate({
    to: "/repo/$owner/$name/pull/$number",
    params: { owner: "a", name: "b", number: "7" },
  });
  const panel = screen.getByRole("region", { name: "Pull request #7" });
  await expect.element(panel).toBeVisible();
  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeInTheDocument();

  router.history.back();
  await expect.element(panel).not.toBeInTheDocument();
  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();
});

test("the panel's close link returns to the repository", async () => {
  const { screen, router } = await renderApp("/repo/a/b/pull/7");

  await screen.getByRole("region").getByRole("link", { name: "Close" }).click();

  await expect.element(screen.getByRole("region")).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/repo/a/b");
});

// AC-3.10: invalid names and numbers never reach a GitHub request.
for (const path of ["/repo/a/b/pull/abc", "/repo/a/b/pull/1x", "/repo/a%22%7D/b", "/repo/a/.."]) {
  test(`${path} is not found`, async () => {
    const { screen } = await renderApp(path);

    await expect.element(screen.getByText("Page not found.")).toBeVisible();
  });
}

test("without an account every app route redirects to sign-in", async () => {
  const { screen, router } = await renderApp("/repo/a/b", { hasAccount: false });

  await expect.element(screen.getByRole("heading", heading("Sign in to GitHub"))).toBeVisible();
  expect(router.state.location.pathname).toBe("/sign-in");
  // Sign-in stands alone: no shell around it.
  await expect.element(screen.getByRole("banner")).not.toBeInTheDocument();
});

test("/settings renders inside the shell", async () => {
  const { screen } = await renderApp("/settings");

  await expect
    .element(screen.getByRole("main").getByRole("heading", heading("Settings")))
    .toBeVisible();
});
