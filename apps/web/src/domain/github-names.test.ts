import { describe, expect, it } from "vitest";
import { parseOwner, parsePullNumber, parsePullTarget, parseRepoName } from "./github-names.ts";

describe("parsePullTarget", () => {
  it("reads owner/name/number", () => {
    expect(parsePullTarget("acme/app.js/12")).toEqual({
      owner: "acme",
      name: "app.js",
      number: 12,
    });
  });

  it.each([undefined, 12, "", "acme/app", "acme/app/1x", "acme/../1", "a/b/1/2", 'a"}/b/1'])(
    "rejects %j",
    (value) => {
      expect(parsePullTarget(value)).toBeNull();
    },
  );
});

describe("GitHub name validators (FR-3.14)", () => {
  it("rejects the AC-3.10 inputs", () => {
    // /repo/a%22%7D/b decodes to owner `a"}`.
    expect(parseOwner(decodeURIComponent("a%22%7D"))).toEqual({
      ok: false,
      error: "invalid-owner",
    });
    expect(parsePullNumber("1x")).toEqual({ ok: false, error: "invalid-number" });
  });

  it.each(["octo-org", "a", "A1-b2", "x".repeat(39)])("accepts owner %s", (owner) => {
    expect(parseOwner(owner)).toEqual({ ok: true, value: owner });
  });

  it.each(["", "x".repeat(40), "a_b", "a.b", "a/b", "a b", "ä"])("rejects owner %j", (owner) => {
    expect(parseOwner(owner).ok).toBe(false);
  });

  it.each(["repo", ".github", "a_b-c.d", "x".repeat(100)])("accepts repo %s", (repo) => {
    expect(parseRepoName(repo)).toEqual({ ok: true, value: repo });
  });

  it.each(["", ".", "..", "x".repeat(101), "a/b", 'a"}', "a b"])("rejects repo %j", (repo) => {
    expect(parseRepoName(repo)).toEqual({ ok: false, error: "invalid-repo" });
  });

  it.each([
    ["1", 1],
    ["42", 42],
    ["2147483647", 2_147_483_647],
  ])("accepts number %s", (text, number) => {
    expect(parsePullNumber(text)).toEqual({ ok: true, value: number });
  });

  it.each(["", "0", "01", "-1", "+1", "1.0", "1e3", " 1", "2147483648", "0x10"])(
    "rejects number %j",
    (text) => {
      expect(parsePullNumber(text).ok).toBe(false);
    },
  );
});
