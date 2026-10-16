import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { AuthProvider } from "../../src/application/auth-provider.tsx";
import type { GitHubAppSignInPort, SignInResult } from "../../src/application/auth.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import { SignInPage } from "../../src/features/auth/SignInPage.tsx";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { createInMemoryGitHubApp } from "../fakes/in-memory-github-app.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { renderWithProviders } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const CLASSIC_TOKEN = "ghp_fake_classic_token_for_tests_only";
const FINE_GRAINED_TOKEN = "github_pat_FAKE_fixture_token_for_tests_only";
const READ_ONLY_TOKEN = "github_pat_FAKE_read_only_nothing_to_warn";

guardAgainstTokenLeaks([CLASSIC_TOKEN, FINE_GRAINED_TOKEN, READ_ONLY_TOKEN]);

const baseAccount: Account = {
  id: toAccountId(1000001)!,
  login: "octo-fixture",
  avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};

const results: Record<string, SignInResult> = {
  [CLASSIC_TOKEN]: {
    account: { ...baseAccount, tokenType: "classic", scopes: ["repo", "read:org"] },
    missingPermissions: [],
    ssoAuthorizationNeeded: false,
  },
  [FINE_GRAINED_TOKEN]: {
    account: baseAccount,
    missingPermissions: ["org-membership"],
    ssoAuthorizationNeeded: false,
  },
  [READ_ONLY_TOKEN]: {
    account: baseAccount,
    missingPermissions: [],
    ssoAuthorizationNeeded: false,
  },
};

async function renderSignIn(githubApp: GitHubAppSignInPort | null = null) {
  const accountStore = createInMemoryAccountStore();
  const onContinue = vi.fn<() => void>();
  const screen = await renderWithProviders(
    <AuthProvider
      auth={createInMemoryAuth(accountStore, results)}
      accountStore={accountStore}
      githubApp={githubApp}
    >
      <SignInPage onContinue={onContinue} />
    </AuthProvider>,
  );
  const signIn = async (token: string) => {
    await screen.getByLabelText("Personal access token").fill(token);
    await screen.getByRole("button", { name: "Sign in" }).click();
  };
  return { screen, signIn, onContinue, accountStore };
}

test("the token input is a labelled password field with autocomplete off", async () => {
  const { screen } = await renderSignIn();

  const input = screen.getByLabelText("Personal access token");
  await expect.element(input).toHaveAttribute("type", "password");
  await expect.element(input).toHaveAttribute("autocomplete", "off");
});

test("a classic token with repo shows the write-access warning (AC-2.2)", async () => {
  const { screen, signIn, onContinue } = await renderSignIn();

  await signIn(CLASSIC_TOKEN);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Signed in as octo-fixture.");
  await expect
    .element(screen.getByRole("region", { name: "About this token" }))
    .toMatchTextContent("can write to your repositories");
  expect(onContinue).not.toHaveBeenCalled();
});

test("a fine-grained token missing a permission shows what to grant, without the write warning", async () => {
  const { screen, signIn } = await renderSignIn();

  await signIn(FINE_GRAINED_TOKEN);

  const region = screen.getByRole("region", { name: "About this token" });
  await expect.element(region).not.toMatchTextContent("can write");
  await expect
    .element(region)
    .toMatchTextContent("Organisation membership: Organization permissions → Members: Read-only");
});

test("a read-only token with nothing to warn about continues straight away", async () => {
  const { signIn, onContinue } = await renderSignIn();

  await signIn(READ_ONLY_TOKEN);

  await expect.poll(() => onContinue.mock.calls.length).toBe(1);
});

test("an invalid token announces an error and stores nothing (AC-2.1)", async () => {
  const { screen, signIn, accountStore } = await renderSignIn();

  await signIn("github_pat_FAKE_unknown_to_the_fake");

  await expect
    .element(screen.getByRole("alert"))
    .toMatchTextContent("This token is invalid, revoked or expired.");
  await expect.element(screen.getByLabelText("Personal access token")).toHaveValue("");
  expect(accountStore.list()).toEqual([]);
});

test("the sign-in page has no axe violations in either theme", async () => {
  const { screen } = await renderSignIn();

  await expectNoAxeViolations(screen.container);
});

const APP_BUTTON = "Sign in with GitHub App";

test("without GitHub App config the button is disabled and says why (AC-2.3)", async () => {
  const { screen } = await renderSignIn();

  const button = screen.getByRole("button", { name: APP_BUTTON });
  await expect.element(button).toBeDisabled();
  await expect
    .element(button)
    .toHaveAccessibleDescription(
      "GitHub App sign-in is not set up for this deployment. Sign in with a personal access token instead.",
    );
  await expectNoAxeViolations(screen.container);
});

test("with GitHub App config the button starts the redirect (AC-2.3)", async () => {
  const githubApp = createInMemoryGitHubApp({
    account: baseAccount,
    missingPermissions: [],
    ssoAuthorizationNeeded: false,
  });
  const { screen } = await renderSignIn(githubApp.port);

  const button = screen.getByRole("button", { name: APP_BUTTON });
  await expect.element(button).toBeEnabled();
  await expect.element(button).not.toHaveAttribute("aria-describedby");
  await expectNoAxeViolations(screen.container);

  await button.click();
  expect(githubApp.calls.starts).toEqual([{ rememberMe: false }]);
});

test("the remember-me choice goes with a GitHub App sign-in (FR-2.7)", async () => {
  const githubApp = createInMemoryGitHubApp({
    account: baseAccount,
    missingPermissions: [],
    ssoAuthorizationNeeded: false,
  });
  const { screen } = await renderSignIn(githubApp.port);

  await screen.getByLabelText("Remember me on this device").click();
  await screen.getByRole("button", { name: APP_BUTTON }).click();

  expect(githubApp.calls.starts).toEqual([{ rememberMe: true }]);
});

// T10
test("remember me is off by default, and the choice is stored with the account (FR-2.7)", async () => {
  const { screen, signIn, accountStore, onContinue } = await renderSignIn();
  const remember = screen.getByLabelText("Remember me on this device");
  await expect.element(remember).not.toBeChecked();

  await signIn(READ_ONLY_TOKEN);
  await expect.poll(() => onContinue.mock.calls.length).toBe(1);
  expect(accountStore.list()[0]?.rememberMe).toBe(false);

  await remember.click();
  await signIn(READ_ONLY_TOKEN);
  await expect.poll(() => accountStore.list()[0]?.rememberMe).toBe(true);
  expect(accountStore.list()).toHaveLength(1);
});

test("after a 401, the page says which account needs a new token", async () => {
  const accountStore = createInMemoryAccountStore();
  const screen = await renderWithProviders(
    <AuthProvider auth={createInMemoryAuth(accountStore, results)} accountStore={accountStore}>
      <SignInPage onContinue={() => undefined} reauthLogin="octo-fixture" />
    </AuthProvider>,
  );

  await expect
    .element(
      screen.getByText("GitHub no longer accepts the token for octo-fixture.", { exact: false }),
    )
    .toBeInTheDocument();
  await expectNoAxeViolations(screen.container);
});

// sign-in redesign
test("show token flips the input type without moving the token into React state", async () => {
  const { screen } = await renderSignIn();
  const input = screen.getByLabelText("Personal access token");
  const toggle = screen.getByRole("button", { name: "Show token" });
  await input.fill("github_pat_FAKE_unknown_to_the_fake");

  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.element(input).toHaveAttribute("type", "text");
  await expect.element(input).toHaveValue("github_pat_FAKE_unknown_to_the_fake");

  // Submitting clears the field and hides it again.
  await screen.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toBeInTheDocument();
  await expect.element(input).toHaveAttribute("type", "password");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
});

test("the create-token links open GitHub pre-filled with the read permissions", async () => {
  const { screen } = await renderSignIn();

  const fineGrained = screen.getByRole("link", { name: /Create a fine-grained token on GitHub/ });
  const href = new URL(fineGrained.element().getAttribute("href") ?? "");
  expect(href.origin + href.pathname).toBe(
    "https://github.com/settings/personal-access-tokens/new",
  );
  expect(Object.fromEntries(href.searchParams)).toMatchObject({
    name: "GitHub Dashboard",
    pull_requests: "read",
    statuses: "read",
    contents: "read",
    members: "read",
  });
  await expect.element(fineGrained).toHaveAttribute("target", "_blank");

  const classic = screen.getByRole("link", { name: /Create a classic token instead/ });
  const classicHref = new URL(classic.element().getAttribute("href") ?? "");
  expect(classicHref.pathname).toBe("/settings/tokens/new");
  expect(classicHref.searchParams.get("scopes")).toBe("repo,read:org");
  await expect.element(classic).toHaveAccessibleDescription(/also grants write access/);
});

test("while the token is checked the submit button is busy but stays focusable", async () => {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, results);
  const screen = await renderWithProviders(
    <AuthProvider
      auth={{ ...auth, signIn: () => new Promise<never>(() => undefined) }}
      accountStore={accountStore}
    >
      <SignInPage onContinue={() => undefined} />
    </AuthProvider>,
  );

  await screen.getByLabelText("Personal access token").fill(READ_ONLY_TOKEN);
  await screen.getByRole("button", { name: "Sign in", exact: true }).click();

  const busy = screen.getByRole("button", { name: "Checking token…" });
  await expect.element(busy).toHaveAttribute("aria-busy", "true");
  await expect.element(busy).toHaveAttribute("aria-disabled", "true");
  await expect.element(busy).not.toHaveAttribute("disabled");
  (busy.element() as HTMLElement).focus();
  expect(document.activeElement).toBe(busy.element());
});

test("the sign-in page has its own theme toggle and language picker", async () => {
  const { screen } = await renderSignIn();

  await screen.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);
  await screen.getByRole("button", { name: "Switch to light theme" }).click();
  await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(false);

  await screen.getByRole("combobox", { name: "Language" }).selectOptions("Suomi");
  await expect
    .element(screen.getByRole("heading", { level: 1 }))
    .toHaveTextContent("Kirjaudu GitHubiin");
});

const noScroll = () => {
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
};

for (const width of [320, 1280]) {
  test(`at ${width} px every sign-in state has one h1, a main landmark and no axe violations`, async () => {
    await page.viewport(width, 800);
    const githubApp = createInMemoryGitHubApp({
      account: baseAccount,
      missingPermissions: [],
      ssoAuthorizationNeeded: false,
    });

    // Empty form, GitHub App disabled.
    const first = await renderSignIn();
    await expect.element(first.screen.getByRole("main")).toBeInTheDocument();
    expect(first.screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
    await expectNoAxeViolations(first.screen.container);
    noScroll();

    // Error state.
    await first.signIn("github_pat_FAKE_unknown_to_the_fake");
    await expect.element(first.screen.getByRole("alert")).toBeInTheDocument();
    await expectNoAxeViolations(first.screen.container);
    noScroll();

    // Post-sign-in warnings.
    await first.signIn(CLASSIC_TOKEN);
    await expect
      .element(first.screen.getByRole("region", { name: "About this token" }))
      .toBeInTheDocument();
    await expectNoAxeViolations(first.screen.container);
    noScroll();
    await first.screen.unmount();

    // GitHub App enabled.
    const enabled = await renderSignIn(githubApp.port);
    await expect.element(enabled.screen.getByRole("button", { name: APP_BUTTON })).toBeEnabled();
    await expectNoAxeViolations(enabled.screen.container);
    await enabled.screen.unmount();

    // Re-auth.
    const accountStore = createInMemoryAccountStore();
    const reauth = await renderWithProviders(
      <AuthProvider auth={createInMemoryAuth(accountStore, results)} accountStore={accountStore}>
        <SignInPage onContinue={() => undefined} reauthLogin="octo-fixture" />
      </AuthProvider>,
    );
    await expect.element(reauth.getByText("OC", { exact: true })).toBeInTheDocument();
    await expectNoAxeViolations(reauth.container);
    noScroll();
  });
}
