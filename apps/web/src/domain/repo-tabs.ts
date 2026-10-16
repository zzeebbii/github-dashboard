import type { PullRequest } from "./pull-request.ts";

/**
 * The repository page's tabs (FR-4.6), after the design's `tabF` minus `closed`: only open
 * PRs are ever fetched, so every PR here is open. "Needs review" is open, not a draft, and
 * without a single review (resolved by the PO in scope validation).
 */
export const REPO_TABS = ["open", "draft", "review"] as const;
export type RepoTab = (typeof REPO_TABS)[number];

export function inRepoTab(pr: PullRequest, tab: RepoTab): boolean {
  if (tab === "draft") return pr.isDraft;
  if (tab === "review") return !pr.isDraft && pr.reviews.length === 0;
  return true;
}

/** A URL's `tab` value, or the default tab. */
export function toRepoTab(value: unknown): RepoTab {
  return REPO_TABS.find((tab) => tab === value) ?? "open";
}
