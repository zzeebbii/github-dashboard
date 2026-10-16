import type { Actor, Mergeable, ReviewRequest, ReviewState } from "./pull-request.ts";

/**
 * One pull request as the detail panel shows it (FR-6.1–6.4). Plain types: the GitHub
 * adapter validates and maps onto these. Every `bodyHTML` is GitHub-rendered HTML that
 * stays a string until ui/SafeHtml.tsx sanitises it (FR-6.6).
 */

/** Which pull request: `owner/name#number`. Names pass domain/github-names.ts first. */
export interface PullRequestRef {
  readonly owner: string;
  readonly name: string;
  readonly number: number;
}

export interface PullRequestDetail {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly isDraft: boolean;
  readonly bodyHTML: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly headSha: string;
  readonly headRef: string;
  readonly baseRef: string;
  readonly mergeable: Mergeable;
  /** GitHub's exact merge state. Only this single-PR query asks for it (github-query-costs.md). */
  readonly mergeStateStatus: MergeStateStatus;
  readonly author: Actor | null;
  readonly labels: readonly { readonly name: string; readonly color: string }[];
  readonly assignees: readonly string[];
  readonly milestone: string | null;
  readonly reviewRequests: readonly ReviewRequest[];
  /** The latest submitted review of each reviewer. */
  readonly reviews: readonly { readonly author: Actor | null; readonly state: ReviewState }[];
  readonly reviewThreads: readonly ReviewThread[];
}

export type MergeStateStatus =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE";

export interface ReviewThread {
  readonly id: string;
  readonly isResolved: boolean;
  readonly isOutdated: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comments: readonly ReviewComment[];
}

interface ReviewComment {
  readonly id: string;
  readonly url: string;
  readonly author: Actor | null;
  readonly createdAt: string;
  readonly bodyHTML: string;
  /** The diff snippet the comment is on. */
  readonly diffHunk: string;
}

export type TimelineItem =
  | {
      readonly kind: "comment";
      readonly id: string;
      readonly url: string;
      readonly author: Actor | null;
      readonly createdAt: string;
      readonly bodyHTML: string;
    }
  | {
      readonly kind: "review";
      readonly id: string;
      readonly url: string;
      readonly author: Actor | null;
      readonly state: ReviewState;
      readonly submittedAt: string | null;
      readonly bodyHTML: string;
    };

/** 50 timeline items; `nextCursor` is null on the last page. */
export interface TimelinePage {
  readonly items: readonly TimelineItem[];
  readonly nextCursor: string | null;
}

type CheckStatus = "COMPLETED" | "IN_PROGRESS" | "PENDING" | "QUEUED" | "REQUESTED" | "WAITING";
type CheckConclusion =
  | "ACTION_REQUIRED"
  | "CANCELLED"
  | "FAILURE"
  | "NEUTRAL"
  | "SKIPPED"
  | "STALE"
  | "STARTUP_FAILURE"
  | "SUCCESS"
  | "TIMED_OUT";

export interface CheckAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly level: "FAILURE" | "NOTICE" | "WARNING" | null;
  readonly title: string | null;
  readonly message: string;
}

export interface CheckRun {
  readonly name: string;
  /** The app that ran it ("GitHub Actions"); null when GitHub hides it. */
  readonly app: string | null;
  readonly status: CheckStatus;
  readonly conclusion: CheckConclusion | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly detailsUrl: string | null;
  /** The run's output title and Markdown summary. Never logs. */
  readonly title: string | null;
  readonly summary: string | null;
  /** Omitted when GitHub cannot say whether the run is required. */
  readonly isRequired?: boolean;
  /** Failing runs only; empty otherwise. */
  readonly annotations: readonly CheckAnnotation[];
}
