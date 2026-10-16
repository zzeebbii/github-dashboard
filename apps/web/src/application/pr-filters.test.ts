import { describe, expect, it } from "vitest";
import { aPullRequest } from "../../tests/fakes/pull-request.ts";
import {
  applyPrFilters,
  defaultPrFilters,
  hasActivePrFilters,
  type PrFilters,
  parsePrFilters,
  toPrFilterSearch,
} from "./pr-filters.ts";

const now = new Date("2026-10-30T00:00:00Z");
const viewer = { viewerLogin: "me", now };
const filters = (patch: Partial<PrFilters>): PrFilters => ({ ...defaultPrFilters, ...patch });
const ids = (prs: readonly { id: string }[]) => prs.map((p) => p.id);

describe("parsePrFilters", () => {
  it("gives the defaults for an empty or non-object search", () => {
    expect(parsePrFilters({})).toEqual(defaultPrFilters);
    expect(parsePrFilters(undefined)).toEqual(defaultPrFilters);
    expect(parsePrFilters("nonsense")).toEqual(defaultPrFilters);
  });

  it("keeps every valid field", () => {
    const valid = { q: "auth", label: ["bug"], updated: "stale", drafts: false, sort: "newest" };
    expect(parsePrFilters(valid)).toEqual(valid);
  });

  it("falls back field by field, keeping the valid ones", () => {
    expect(
      parsePrFilters({ q: "auth", label: [1], updated: 7, drafts: "no", sort: "bogus" }),
    ).toEqual({ ...defaultPrFilters, q: "auth" });
    expect(parsePrFilters({ q: "x".repeat(201), sort: "smallest" })).toEqual({
      ...defaultPrFilters,
      sort: "smallest",
    });
  });

  it("accepts the shapes a hand-typed URL produces", () => {
    // The router JSON-parses `?q=123` to a number and `?label=bug` to a plain string.
    expect(parsePrFilters({ q: 123, label: "bug" })).toMatchObject({ q: "123", label: ["bug"] });
  });
});

describe("toPrFilterSearch", () => {
  it("writes only the fields that differ from the defaults", () => {
    expect(toPrFilterSearch(defaultPrFilters)).toEqual({});
    expect(toPrFilterSearch(filters({ q: "x", drafts: false }))).toEqual({ q: "x", drafts: false });
  });

  it("round-trips through parsePrFilters", () => {
    const all = filters({
      q: "x",
      label: ["a", "b"],
      updated: "7d",
      drafts: false,
      sort: "updated",
    });
    expect(parsePrFilters(toPrFilterSearch(all))).toEqual(all);
  });

  it("reports whether anything is set", () => {
    expect(hasActivePrFilters(defaultPrFilters)).toBe(false);
    expect(hasActivePrFilters(filters({ sort: "newest" }))).toBe(true);
    expect(hasActivePrFilters(filters({ label: ["bug"] }))).toBe(true);
  });
});

describe("applyPrFilters", () => {
  const prs = [
    aPullRequest({
      id: "a",
      title: "Fix Date picker",
      repository: "acme/web",
      number: 12,
      labels: ["bug"],
      updatedAt: "2026-10-29T12:00:00Z",
      activity: [
        {
          kind: "comment",
          author: { login: "bob", typename: "User" },
          createdAt: "2026-10-29T12:00:00Z",
        },
      ],
      additions: 30,
    }),
    aPullRequest({
      id: "b",
      title: "Add billing",
      repository: "acme/billing",
      number: 7,
      author: { login: "carol", typename: "User" },
      labels: ["feature", "backend"],
      isDraft: true,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
      additions: 5,
    }),
    aPullRequest({
      id: "c",
      title: "Old work",
      repository: "acme/web",
      number: 3,
      createdAt: "2026-08-01T00:00:00Z",
      // Only a bot was active recently: still stale.
      updatedAt: "2026-10-28T00:00:00Z",
      activity: [
        {
          kind: "comment",
          author: { login: "ci[bot]", typename: "Bot" },
          createdAt: "2026-10-28T00:00:00Z",
        },
      ],
      additions: 100,
    }),
  ];

  it("keeps everything with the defaults, in the default sort", () => {
    expect(ids(applyPrFilters(prs, defaultPrFilters, viewer))).toHaveLength(3);
  });

  it.each([
    ["date", ["a"]],
    ["BILLING", ["b"]],
    ["carol", ["b"]],
    ["#12", ["a"]],
    ["  web ", ["a", "c"]],
  ])("matches %j against title, repository, author and #number", (q, expected) => {
    expect(ids(applyPrFilters(prs, filters({ q, sort: "smallest" }), viewer)).toSorted()).toEqual(
      expected,
    );
  });

  it("matches any of the selected labels", () => {
    expect(
      ids(applyPrFilters(prs, filters({ label: ["bug", "backend"] }), viewer)).toSorted(),
    ).toEqual(["a", "b"]);
  });

  it.each([
    ["24h", ["a"]],
    ["7d", ["a", "c"]],
    ["30d", ["a", "b", "c"]],
    ["stale", ["b", "c"]],
  ] as const)("filters by updated %s, stale by T18's rule", (updated, expected) => {
    expect(ids(applyPrFilters(prs, filters({ updated }), viewer)).toSorted()).toEqual(expected);
  });

  it("hides drafts when drafts are off", () => {
    expect(ids(applyPrFilters(prs, filters({ drafts: false }), viewer)).toSorted()).toEqual([
      "a",
      "c",
    ]);
  });

  it("sorts with the chosen key", () => {
    expect(ids(applyPrFilters(prs, filters({ sort: "smallest" }), viewer))).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(ids(applyPrFilters(prs, filters({ sort: "updated" }), viewer))).toEqual(["a", "c", "b"]);
  });
});
