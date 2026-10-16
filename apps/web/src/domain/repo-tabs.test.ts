import { describe, expect, it } from "vitest";
import { aPullRequest } from "../../tests/fakes/pull-request.ts";
import { inRepoTab, REPO_TABS, toRepoTab } from "./repo-tabs.ts";

const review = {
  author: { login: "bob", typename: "User" },
  state: "COMMENTED",
  submittedAt: "2026-10-01T00:00:00Z",
} as const;

describe("repository tabs (FR-4.6)", () => {
  it("open holds every PR; draft the drafts; needs review the unreviewed non-drafts", () => {
    const prs = [
      aPullRequest({ id: "draft", isDraft: true }),
      aPullRequest({ id: "unreviewed" }),
      aPullRequest({ id: "reviewed", reviews: [review] }),
      aPullRequest({ id: "draft-unreviewed", isDraft: true, reviews: [] }),
    ];
    const ids = (tab: (typeof REPO_TABS)[number]) =>
      prs.filter((pr) => inRepoTab(pr, tab)).map((pr) => pr.id);

    expect(ids("open")).toEqual(["draft", "unreviewed", "reviewed", "draft-unreviewed"]);
    expect(ids("draft")).toEqual(["draft", "draft-unreviewed"]);
    expect(ids("review")).toEqual(["unreviewed"]);
  });

  it("reads a URL value, falling back to open", () => {
    expect(REPO_TABS.map(toRepoTab)).toEqual(["open", "draft", "review"]);
    expect(toRepoTab("closed")).toBe("open");
    expect(toRepoTab(undefined)).toBe("open");
  });
});
