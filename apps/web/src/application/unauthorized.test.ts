import { expect, test } from "vitest";
import { createInMemoryAccountStore } from "../../tests/fakes/in-memory-account-store.ts";
import { type Account, toAccountId } from "../domain/account.ts";
import { createUnauthorizedHandler } from "./unauthorized.ts";

const A: Account = {
  id: toAccountId(1000001)!,
  login: "octo-a",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: true,
};

function setup() {
  const accounts = createInMemoryAccountStore([A]);
  const forgotten: string[] = [];
  const signIns: string[] = [];
  const onUnauthorized = createUnauthorizedHandler({
    accounts,
    forgetToken: (id) => forgotten.push(id),
    toSignIn: (account) => signIns.push(account),
  });
  return { accounts, forgotten, signIns, onUnauthorized };
}

test("a 401 forgets only that account's token, keeps its record, and asks to sign in as it (FR-2.8)", () => {
  const { accounts, forgotten, signIns, onUnauthorized } = setup();

  onUnauthorized(A.id);

  expect(forgotten).toEqual([A.id]);
  expect(accounts.get(A.id)).toEqual(A);
  expect(signIns).toEqual(["octo-a"]);
});

test("an id with no account record still routes to sign-in, by id", () => {
  const { signIns, onUnauthorized } = setup();
  const unknown = toAccountId(42)!;

  onUnauthorized(unknown);

  expect(signIns).toEqual(["42"]);
});
