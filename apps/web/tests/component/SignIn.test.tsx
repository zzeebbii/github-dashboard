import { expect, test, vi } from "vitest";
import { AuthProvider } from "../../src/application/auth-provider.tsx";
import type { SignInResult } from "../../src/application/auth.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import { SignInPage } from "../../src/features/auth/SignInPage.tsx";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
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

async function renderSignIn() {
  const accountStore = createInMemoryAccountStore();
  const onContinue = vi.fn<() => void>();
  const screen = await renderWithProviders(
    <AuthProvider auth={createInMemoryAuth(accountStore, results)} accountStore={accountStore}>
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
