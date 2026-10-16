/**
 * The pull request as the domain sees it: the BR-11 row fields plus the review
 * and activity summary the Home rules need.
 *
 * This file has ZERO imports. The GitHub adapter (infrastructure/github) parses
 * responses with Zod and maps them onto these plain types. Timestamps are ISO
 * 8601 strings exactly as GitHub returns them; "now" is always passed in.
 */

/** Who did something. `typename` is GitHub's `__typename` (`User`, `Bot`, ...). */
export interface Actor {
  readonly login: string;
  readonly typename: string;
}

/** The signed-in account, plus the teams (`org/slug`) it belongs to. */
export interface Viewer {
  readonly login: string;
  readonly teams: readonly string[];
}

type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";
/** Head commit status check rollup. */
type CheckState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";
/**
 * `UNKNOWN` while GitHub is still computing it: shown as "checking" until a refresh fills it.
 * There is no `mergeStateStatus`: it is too slow to select in a list (≈ 0.3 s per PR,
 * docs/architecture/github-query-costs.md).
 */
export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export interface Review {
  /** null when the account was deleted ("ghost"). */
  readonly author: Actor | null;
  readonly state: ReviewState;
  readonly submittedAt: string;
}

/** A pending review request, for a person or a team (`org/slug`). */
export type ReviewRequest =
  | { readonly kind: "user"; readonly login: string }
  | { readonly kind: "team"; readonly team: string };

/** Something that happened on the PR. Feeds "+N new" and staleness. */
export interface ActivityItem {
  readonly kind: "comment" | "review" | "reply" | "commit";
  readonly author: Actor | null;
  readonly createdAt: string;
}

export interface PullRequest {
  readonly id: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly author: Actor | null;
  readonly labels: readonly string[];
  readonly isDraft: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The head commit SHA. With `updatedAt` it keys the detail cache (T22). */
  readonly headSha: string;
  readonly additions: number;
  readonly deletions: number;
  readonly commentCount: number;
  readonly reviewDecision: ReviewDecision | null;
  readonly checkState: CheckState | null;
  readonly mergeable: Mergeable;
  readonly reviewRequests: readonly ReviewRequest[];
  readonly reviews: readonly Review[];
  /** Date of the head commit (`commits(last:1)`); the "last push". */
  readonly headCommittedAt: string | null;
  /** Latest `REVIEW_REQUESTED_EVENT` naming the viewer. */
  readonly viewerReviewRequestedAt: string | null;
  readonly activity: readonly ActivityItem[];
}

/** GitHub logins are case-insensitive. */
export function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function isBot(actor: Actor | null): boolean {
  return actor !== null && (actor.typename === "Bot" || actor.login.endsWith("[bot]"));
}

export function isAuthoredBy(pr: PullRequest, login: string): boolean {
  return pr.author !== null && sameLogin(pr.author.login, login);
}

export function toMillis(iso: string): number {
  return Date.parse(iso);
}
