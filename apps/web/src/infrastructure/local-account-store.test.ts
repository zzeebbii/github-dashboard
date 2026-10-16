import { beforeEach, expect, test } from "vitest";
import { createUnauthorizedHandler } from "../application/unauthorized.ts";
import { type Account, toAccountId } from "../domain/account.ts";
import { createLocalAccountStore } from "./local-account-store.ts";

beforeEach(() => {
  localStorage.clear();
});

test("an account saved before expiry tracking was dropped still loads, without expiresAt", () => {
  const old = {
    id: "1000001",
    login: "octo-fixture",
    avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
    tokenType: "fine-grained",
    scopes: [],
    expiresAt: "2026-10-20T12:00:00.000Z",
    rememberMe: false,
  };
  localStorage.setItem("ghd:accounts", JSON.stringify([old]));

  const { expiresAt: _dropped, ...expected } = old;
  expect(createLocalAccountStore().list()).toEqual([expected]);
});

const account = (id: number): Account => ({
  id: toAccountId(id)!,
  login: `octo-${id}`,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: true,
});
const A = account(1);
const B = account(2);
const favourite = { nodeId: "R_1", nameWithOwner: "acme/app" };

test("favourites are kept per account; removing an account deletes only its own (FR-4.4)", () => {
  const store = createLocalAccountStore();
  store.upsert(A);
  store.upsert(B);
  store.setFavourites(A.id, [favourite]);
  store.setFavourites(B.id, [{ nodeId: "R_2", nameWithOwner: "beta/web" }]);

  expect(createLocalAccountStore().favourites(A.id)).toEqual([favourite]);
  store.remove(B.id);
  expect(store.favourites(B.id)).toEqual([]);
  expect(store.favourites(A.id)).toEqual([favourite]);
});

test("a 401 keeps the account's favourites (FR-2.8)", () => {
  const store = createLocalAccountStore();
  store.upsert(A);
  store.setFavourites(A.id, [favourite]);

  createUnauthorizedHandler({
    accounts: store,
    forgetToken: () => undefined,
    toSignIn: () => undefined,
  })(A.id);

  expect(store.favourites(A.id)).toEqual([favourite]);
});

test("stored favourites are validated on read: a bad entry is dropped, not the rest", () => {
  localStorage.setItem(
    "ghd:favourites",
    JSON.stringify({
      [A.id]: [favourite, { nodeId: "", nameWithOwner: "x" }, { nodeId: "R_9", extra: 1 }],
      [B.id]: "not a list",
    }),
  );
  expect(createLocalAccountStore().favourites(A.id)).toEqual([favourite]);

  localStorage.setItem("ghd:favourites", "{not json");
  expect(createLocalAccountStore().favourites(A.id)).toEqual([]);
});
