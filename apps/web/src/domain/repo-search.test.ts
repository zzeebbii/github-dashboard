import { describe, expect, it } from "vitest";
import type { Repository } from "./favourites.ts";
import { MAX_SEARCH_LENGTH, parseRepoSearch, sortByName } from "./repo-search.ts";

const NAMES = [
  "acme/auth-api",
  "acme/billing",
  "acme/user-service",
  "octo/next.js",
  "octo/nextAjs",
];
const matching = (input: string) => NAMES.filter(parseRepoSearch(input).matches);
const repo = (nameWithOwner: string): Repository => ({
  id: nameWithOwner,
  nameWithOwner,
  visibility: "PUBLIC",
  description: null,
});

describe("repository search (FR-4.3, AC-4.2)", () => {
  it("matches everything when empty or blank", () => {
    expect(parseRepoSearch("   ").mode).toBe("none");
    expect(matching("")).toEqual(NAMES);
  });

  it("matches a plain text as a case-insensitive substring of owner/name", () => {
    expect(parseRepoSearch("BILL").mode).toBe("substring");
    expect(matching("BILL")).toEqual(["acme/billing"]);
    expect(matching("acme/u")).toEqual(["acme/user-service"]);
  });

  it("treats a dot alone as text, so names with dots match exactly", () => {
    expect(parseRepoSearch("next.js").mode).toBe("substring");
    expect(matching("next.js")).toEqual(["octo/next.js"]);
  });

  it("evaluates input with a metacharacter as a regex (^auth|service$)", () => {
    // `^` anchors at the start of owner/name, so `^auth` matches no `acme/` repository.
    expect(parseRepoSearch("^auth|service$").mode).toBe("regex");
    expect(matching("^auth|service$")).toEqual(["acme/user-service"]);
    expect(matching("/auth|service$")).toEqual(["acme/auth-api", "acme/user-service"]);
    expect(matching("NEXT.js$")).toEqual(["octo/next.js", "octo/nextAjs"]);
  });

  it("reports an invalid regex and matches it as plain text", () => {
    const search = parseRepoSearch("(");
    expect(search.mode).toBe("invalidRegex");
    expect(NAMES.filter(search.matches)).toEqual([]);
    expect(parseRepoSearch("[a-").mode).toBe("invalidRegex");
  });

  it("never matches the description", () => {
    expect(parseRepoSearch("payments").matches("acme/billing")).toBe(false);
  });

  it("caps the input at 200 characters", () => {
    const search = parseRepoSearch(`${"a".repeat(MAX_SEARCH_LENGTH)}zzz`);
    expect(search.matches(`acme/${"a".repeat(MAX_SEARCH_LENGTH)}`)).toBe(true);
  });
});

describe("catastrophic backtracking guard", () => {
  // The longest owner/name GitHub allows (39 + 1 + 100), made of the worst characters.
  const longName = `${"a".repeat(39)}/${"a".repeat(100)}!`;

  it.each([
    "(a+)+$",
    "(a*)*b",
    "(?:a+){2,}b",
    "(a|aa)*x",
    "((a|b)c)+",
    "(?<x>a+)+$",
    "a+a+a+b",
    "(a)\\1",
  ])("refuses %s before running it, and matches it as text instead", (pattern) => {
    const search = parseRepoSearch(pattern);
    expect(search.mode).toBe("tooComplex");
    expect(search.matches(longName)).toBe(false);
  });

  it("does not hang on the pathological pattern against a long name", () => {
    const started = Date.now();
    for (let i = 0; i < 1000; i += 1) parseRepoSearch("(a+)+$").matches(longName);
    // Refused patterns are a substring test: 1000 of them take well under a second.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it.each([
    "^auth|service$",
    ".*api$",
    "^acme/.+-service",
    "[a-z]+[0-9]?",
    "(?:auth|billing)-",
    "a{2}b+",
  ])("allows %s, which stays fast on the longest name", (pattern) => {
    const search = parseRepoSearch(pattern);
    expect(search.mode).toBe("regex");
    const started = Date.now();
    search.matches(longName);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("does not count quantifier characters inside a class or escaped", () => {
    expect(parseRepoSearch("[*+?]\\+\\*a+b+").mode).toBe("regex");
    expect(parseRepoSearch("([a+])+").mode).toBe("regex");
  });
});

describe("sortByName (FR-4.2)", () => {
  it("lists every repository once, A–Z by owner/name, ignoring case", () => {
    const sorted = sortByName(["octo/b", "Acme/x", "octo/A"].map(repo));
    expect(sorted.map((r) => r.nameWithOwner)).toEqual(["Acme/x", "octo/A", "octo/b"]);
  });
});
