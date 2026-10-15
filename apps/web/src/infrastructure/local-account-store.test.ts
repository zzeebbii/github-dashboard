import { beforeEach, expect, test } from "vitest";
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
