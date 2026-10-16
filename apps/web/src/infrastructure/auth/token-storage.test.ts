import { beforeEach, expect, test } from "vitest";
import { toAccountId } from "../../domain/account.ts";
import { createTokenStorage } from "./token-storage.ts";

const ID = toAccountId(1000001)!;
const TOKEN = "github_pat_FAKE_token_storage_fixture";

/** A new browser session: sessionStorage starts empty, localStorage survives. */
function newSession() {
  sessionStorage.clear();
  return createTokenStorage();
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

test("remember me off: a new session has no token, so sign-in is needed again (AC-2.5)", () => {
  createTokenStorage().write(ID, TOKEN, false);
  expect(localStorage.length).toBe(0);

  expect(newSession().read(ID)).toBeNull();
});

test("remember me on: the token survives a new session (AC-2.5)", () => {
  createTokenStorage().write(ID, TOKEN, true);
  expect(sessionStorage.length).toBe(0);

  expect(newSession().read(ID)).toBe(TOKEN);
});

test("changing the choice moves the token rather than copying it", () => {
  const tokens = createTokenStorage();
  tokens.write(ID, TOKEN, true);
  tokens.write(ID, TOKEN, false);

  expect(localStorage.length).toBe(0);
  expect(tokens.read(ID)).toBe(TOKEN);
});

test("clearAll empties both storages, not only the tokens", () => {
  const tokens = createTokenStorage();
  tokens.write(ID, TOKEN, true);
  localStorage.setItem("ghd:accounts", "[]");
  sessionStorage.setItem("anything", "x");

  tokens.clearAll();

  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
