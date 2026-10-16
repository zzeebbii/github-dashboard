import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";

const CLIENT_ID = "Iv23liFAKEclientid01";
const EXCHANGE_URL = "https://auth.example.test/exchange";

describe("parseEnv: GitHub App (FR-2.5, FR-2.11)", () => {
  it("leaves the GitHub App off when both variables are empty or unset", () => {
    expect(parseEnv({}).githubApp).toBeNull();
    expect(
      parseEnv({ VITE_GITHUB_APP_CLIENT_ID: "", VITE_GITHUB_APP_EXCHANGE_URL: "" }).githubApp,
    ).toBeNull();
  });

  it("needs both variables to turn it on", () => {
    expect(parseEnv({ VITE_GITHUB_APP_CLIENT_ID: CLIENT_ID }).githubApp).toBeNull();
    expect(parseEnv({ VITE_GITHUB_APP_EXCHANGE_URL: EXCHANGE_URL }).githubApp).toBeNull();
  });

  it.each([EXCHANGE_URL, "http://localhost:8787/exchange", "http://127.0.0.1:8787/exchange"])(
    "accepts the exchange URL %s",
    (url) => {
      expect(
        parseEnv({ VITE_GITHUB_APP_CLIENT_ID: CLIENT_ID, VITE_GITHUB_APP_EXCHANGE_URL: url })
          .githubApp,
      ).toEqual({ clientId: CLIENT_ID, exchangeUrl: url });
    },
  );

  it.each([
    "http://auth.example.test/exchange",
    "http://localhost.example.test/exchange",
    "https://user:pass@auth.example.test/exchange",
    "https://auth.example.test/exchange#fragment",
    "javascript:alert(1)",
    "not a url",
  ])("fails fast on the exchange URL %s", (url) => {
    expect(() => parseEnv({ VITE_GITHUB_APP_EXCHANGE_URL: url })).toThrow(
      /VITE_GITHUB_APP_EXCHANGE_URL/,
    );
  });

  it("fails fast on a malformed client id without echoing it", () => {
    expect(() => parseEnv({ VITE_GITHUB_APP_CLIENT_ID: "has spaces&=" })).toThrow(
      /VITE_GITHUB_APP_CLIENT_ID: not a client id/,
    );
    expect(() => parseEnv({ VITE_GITHUB_APP_CLIENT_ID: "has spaces&=" })).not.toThrow(/spaces/);
  });
});
