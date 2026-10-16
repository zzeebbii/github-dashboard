import { expect, test } from "vitest";
import { renderApp } from "../render.tsx";

const heading = (name: string) => ({ level: 1, name }) as const;

test("/repo/a/b then Back returns to / (AC-1.6)", async () => {
  const { screen, router } = await renderApp("/");
  await expect.element(screen.getByRole("heading", heading("Pull requests"))).toBeVisible();

  await router.navigate({ to: "/repo/$owner/$name", params: { owner: "a", name: "b" } });
  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();

  router.history.back();
  await expect.element(screen.getByRole("heading", heading("Pull requests"))).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
});

test("loading /repo/a/b directly renders the repo route (AC-1.6)", async () => {
  const { screen } = await renderApp("/repo/a/b");

  await expect.element(screen.getByRole("heading", heading("a / b"))).toBeVisible();
});

// The PR panel's routes (over the repository page, over Home, Back closes it) are in
// PrPanel.test.tsx: the panel needs a signed-in account.

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
