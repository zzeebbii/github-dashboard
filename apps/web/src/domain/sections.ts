import { isAuthoredBy, type PullRequest, sameLogin, type Viewer } from "./pull-request.ts";
import { isRereviewDue } from "./rereview.ts";

export type Section = "needs-review" | "needs-action" | "waiting";

/** The reason chip. `team` carries the `org/slug` for "Team: @x". */
type Reason =
  | { readonly kind: "review-requested" }
  | { readonly kind: "re-requested" }
  | { readonly kind: "team-requested"; readonly team: string }
  | { readonly kind: "changes-requested" }
  | { readonly kind: "ci-failing" }
  | { readonly kind: "merge-conflicts" }
  | { readonly kind: "ready-to-merge" }
  | { readonly kind: "draft" }
  | { readonly kind: "ci-running" }
  | { readonly kind: "awaiting-review" };

export interface Placement {
  readonly section: Section;
  readonly reason: Reason;
}

interface Rule {
  /** Returns the reason when the rule matches, otherwise null. */
  readonly when: (pr: PullRequest, viewer: Viewer) => Reason | null;
  readonly section: Section;
}

function reviewRequestReason(pr: PullRequest, viewer: Viewer): Reason | null {
  if (isRereviewDue(pr, viewer.login)) return { kind: "re-requested" };
  for (const request of pr.reviewRequests) {
    if (request.kind === "user" && sameLogin(request.login, viewer.login)) {
      return { kind: "review-requested" };
    }
  }
  for (const request of pr.reviewRequests) {
    if (request.kind === "team" && viewer.teams.some((t) => sameLogin(t, request.team))) {
      return { kind: "team-requested", team: request.team };
    }
  }
  return null;
}

/** Rules 3 and 4 skip drafts: drafts reach "needs action" only via rule 2. */
function ownReadyPr(pr: PullRequest, viewer: Viewer): boolean {
  return isAuthoredBy(pr, viewer.login) && !pr.isDraft;
}

/**
 * Rule 5. The pitch says `mergeStateStatus = CLEAN`, but no list query may select it (too
 * slow, see docs/architecture/github-query-costs.md), so "clean" is read from the fields
 * the row has: no conflicts, checks passed (or none), and no review still required. Rule 2
 * already took CHANGES_REQUESTED. What this cannot see is a branch-protection rule beyond
 * reviews and checks (e.g. "up to date with base"); GitHub still enforces it on merge.
 */
function readyToMerge(pr: PullRequest, viewer: Viewer): Reason | null {
  const clean =
    pr.mergeable === "MERGEABLE" &&
    (pr.checkState === "SUCCESS" || pr.checkState === null) &&
    pr.reviewDecision !== "REVIEW_REQUIRED";
  return ownReadyPr(pr, viewer) && clean ? { kind: "ready-to-merge" } : null;
}

function waitingReason(pr: PullRequest): Reason {
  if (pr.isDraft) return { kind: "draft" };
  if (pr.checkState === "PENDING" || pr.checkState === "EXPECTED") return { kind: "ci-running" };
  return { kind: "awaiting-review" };
}

/** The pitch's Home rule table, in order. First match wins. */
const RULES: readonly Rule[] = [
  { section: "needs-review", when: reviewRequestReason },
  {
    section: "needs-action",
    when: (pr, viewer) =>
      isAuthoredBy(pr, viewer.login) && pr.reviewDecision === "CHANGES_REQUESTED"
        ? { kind: "changes-requested" }
        : null,
  },
  {
    section: "needs-action",
    when: (pr, viewer) =>
      ownReadyPr(pr, viewer) && (pr.checkState === "FAILURE" || pr.checkState === "ERROR")
        ? { kind: "ci-failing" }
        : null,
  },
  {
    section: "needs-action",
    when: (pr, viewer) =>
      ownReadyPr(pr, viewer) && pr.mergeable === "CONFLICTING" ? { kind: "merge-conflicts" } : null,
  },
  { section: "needs-action", when: readyToMerge },
  {
    section: "waiting",
    when: (pr, viewer) => (isAuthoredBy(pr, viewer.login) ? waitingReason(pr) : null),
  },
];

/** Where a PR goes on Home, or null when no rule matches (it is not shown). */
export function placePullRequest(pr: PullRequest, viewer: Viewer): Placement | null {
  for (const rule of RULES) {
    const reason = rule.when(pr, viewer);
    if (reason !== null) return { section: rule.section, reason };
  }
  return null;
}
