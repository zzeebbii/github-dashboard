import { expect, test } from "vitest";
import { toAccountId } from "../../src/domain/account.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { GOOD_STATE, createInMemoryGitHubApp } from "../fakes/in-memory-github-app.ts";
import { renderApp } from "../render.tsx";

function fakeGitHubApp() {
  return createInMemoryGitHubApp({
    account: {
      id: toAccountId(1000001)!,
      login: "octo-fixture",
      avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
      tokenType: "github-app",
      scopes: [],
      rememberMe: false,
    },
    missingPermissions: [],
    ssoAuthorizationNeeded: false,
  });
}

test("a valid callback leaves no code or state in the address bar and lands on Home (AC-2.8)", async () => {
  const githubApp = fakeGitHubApp();
  // Holds the exchange open so the in-progress state can be inspected.
  let finishExchange: (() => void) | undefined;
  const exchange = new Promise<void>((resolve) => {
    finishExchange = resolve;
  });
  const { screen, router } = await renderApp(`/auth/callback?code=fake-code&state=${GOOD_STATE}`, {
    githubApp: {
      start: () => githubApp.port.start(),
      complete: async (search) => {
        await exchange;
        return githubApp.port.complete(search);
      },
    },
  });

  await expect.element(screen.getByText("Finishing sign-in…")).toBeVisible();
  // Stripped before the exchange has finished.
  expect(router.history.location.pathname).toBe("/auth/callback");
  expect(router.history.location.search).toBe("");
  await expectNoAxeViolations(screen.container);

  finishExchange?.();
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "GitHub Dashboard" }))
    .toBeVisible();
  expect(githubApp.calls.searches).toEqual([`?code=fake-code&state=${GOOD_STATE}`]);
  expect(router.state.location.pathname).toBe("/");
  // Both steps replace the entry, so Back cannot return to a URL that carried them.
  expect(router.history.location.search).toBe("");
  expect(router.history.length).toBe(1);
});

test("a rejected callback shows a translated error, a way back, and no code in the URL", async () => {
  const githubApp = fakeGitHubApp();
  const { screen, router } = await renderApp("/auth/callback?code=fake-code&state=forged", {
    githubApp: githubApp.port,
  });

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(
      "This sign-in link is invalid, expired or already used. Start the sign-in again.",
    );
  await expect.element(screen.getByRole("link", { name: "Back to sign-in" })).toBeVisible();
  expect(router.history.location.search).toBe("");
  expect(githubApp.calls.searches).toHaveLength(1);
  await expectNoAxeViolations(screen.container);
});

test("without GitHub App config the callback explains, and strips the URL", async () => {
  const { screen, router } = await renderApp(`/auth/callback?code=fake-code&state=${GOOD_STATE}`);

  await expect
    .element(screen.getByRole("alert"))
    .toMatchTextContent("GitHub App sign-in is not set up for this deployment.");
  expect(router.history.location.search).toBe("");
});
