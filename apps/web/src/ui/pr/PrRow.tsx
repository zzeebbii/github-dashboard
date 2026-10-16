import {
  Bot,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  GitPullRequest,
  GitPullRequestDraft,
  LoaderCircle,
  type LucideIcon,
  MessageSquare,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useId } from "react";
import type { createFormat, Translate } from "../../application/i18n.tsx";
import type { Density } from "../../application/preferences.ts";
import type { PullRequest } from "../../domain/pull-request.ts";
import { isBot } from "../../domain/pull-request.ts";
import type { Placement } from "../../domain/sections.ts";
import { Icon } from "../Icon.tsx";

type Reason = Placement["reason"];
type Tone = "red" | "green" | "amber" | "blue" | "muted";

export interface PrRowData {
  readonly pr: PullRequest;
  /** The reason chip; null in a repository list, which has no sections. */
  readonly reason: Reason | null;
  /** "+N new"; null or 0 hides it. */
  readonly newCount: number | null;
  /** Where the title links: the PR panel in this app. */
  readonly href: string;
}

interface PrRowProps extends PrRowData {
  readonly t: Translate;
  readonly format: ReturnType<typeof createFormat>;
  readonly now: Date;
  readonly density: Density;
  /** false in a repository list, where every row has the same repository. */
  readonly showRepository: boolean;
}

const reasonKeys = {
  "review-requested": "r_reviewRequested",
  "re-requested": "r_reRequested",
  "changes-requested": "r_changesRequested",
  "ci-failing": "r_ciFailing",
  "merge-conflicts": "r_mergeConflicts",
  "ready-to-merge": "r_readyToMerge",
  draft: "rt_draft",
  "ci-running": "r_ciRunning",
  "awaiting-review": "r_awaitingReview",
} as const;

const reasonText = (t: Translate, reason: Reason): string =>
  reason.kind === "team-requested"
    ? t("r_team", { team: reason.team })
    : t(reasonKeys[reason.kind]);

const reasonTone: Record<Reason["kind"], Tone> = {
  "review-requested": "blue",
  "re-requested": "blue",
  "team-requested": "muted",
  "changes-requested": "red",
  "ci-failing": "red",
  "merge-conflicts": "amber",
  "ready-to-merge": "green",
  draft: "muted",
  "ci-running": "muted",
  "awaiting-review": "muted",
};

/** The reason chip: text on a soft tint of its tone. The text carries the meaning. */
function ReasonChip({ t, reason }: { t: Translate; reason: Reason }) {
  return (
    <span className="reason-chip" data-tone={reasonTone[reason.kind]}>
      {reason.kind === "team-requested" && <Icon icon={Users} size={12} />}
      {reasonText(t, reason)}
    </span>
  );
}

/** Open or draft as an icon plus visible text, never colour alone (AC-5.6). */
function StatusChip({ t, pr, id }: { t: Translate; pr: PullRequest; id: string }) {
  const draft = pr.isDraft;
  return (
    <span className="pr-status" data-tone={draft ? "muted" : "green"}>
      <Icon icon={draft ? GitPullRequestDraft : GitPullRequest} size={16} />
      <span id={id} className="pr-status-text">
        {t(draft ? "rt_draft" : "rt_open")}
      </span>
    </span>
  );
}

interface Indicator {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly label: string;
  readonly spin?: boolean;
}

const ciIndicators = {
  SUCCESS: { icon: CircleCheck, tone: "green", key: "pr_ciPassing" },
  FAILURE: { icon: CircleX, tone: "red", key: "pr_ciFailing" },
  ERROR: { icon: CircleX, tone: "red", key: "pr_ciFailing" },
  PENDING: { icon: LoaderCircle, tone: "amber", key: "pr_ciRunning", spin: true },
  EXPECTED: { icon: LoaderCircle, tone: "amber", key: "pr_ciRunning", spin: true },
} as const;

function ciIndicator(t: Translate, pr: PullRequest): Indicator | null {
  if (pr.checkState === null) return null;
  const { key, ...indicator } = ciIndicators[pr.checkState];
  return { ...indicator, label: t(key) };
}

/** The design's review cell: "Changes", "approved/total", "0/total" or "—". */
function reviewIndicator(t: Translate, pr: PullRequest): Indicator & { text: string } {
  const latest = new Map<string, string>();
  for (const review of pr.reviews.toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    if (review.author !== null && review.state !== "COMMENTED") {
      latest.set(review.author.login.toLowerCase(), review.state);
    }
  }
  const approvals = [...latest.values()].filter((state) => state === "APPROVED").length;
  const total = approvals + pr.reviewRequests.length;
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return {
      icon: CircleAlert,
      tone: "red",
      text: t("pr_reviewChanges"),
      label: t("r_changesRequested"),
    };
  }
  if (approvals > 0) {
    return {
      icon: Check,
      tone: "green",
      text: `${approvals}/${total}`,
      label: t("pr_reviewApproved", { a: approvals, n: total }),
    };
  }
  if (total > 0) {
    return { icon: CircleDashed, tone: "muted", text: `0/${total}`, label: t("r_awaitingReview") };
  }
  return { icon: CircleDashed, tone: "muted", text: "—", label: t("pr_noReviewers") };
}

/**
 * One PR in a list, after the design's `row(p, i, repoView, hideFirstBorder)`. Every BR-11
 * field, the reason chip and "+N new" (FR-5.6). GitHub content (title, logins, labels) is
 * rendered as React text only.
 *
 * Fixed height per density, so the windowed list can position rows without measuring each.
 * The title link's accessible name is the status then the title (AC-5.6).
 */
export function PrRow({
  t,
  format,
  now,
  density,
  showRepository,
  pr,
  reason,
  newCount,
  href,
}: PrRowProps) {
  const id = useId();
  const login = pr.author?.login ?? "ghost";
  const ci = ciIndicator(t, pr);
  const review = reviewIndicator(t, pr);
  const fresh = newCount !== null && newCount > 0;
  return (
    <div className="pr-row" data-density={density}>
      <StatusChip t={t} pr={pr} id={`${id}-status`} />
      <div className="pr-main">
        <div className="pr-title-line">
          {fresh && <span className="pr-new-dot" aria-hidden="true" />}
          <a
            href={href}
            className="pr-title"
            aria-labelledby={`${id}-status ${id}-title`}
            title={pr.title}
          >
            <span id={`${id}-title`}>{pr.title}</span>
          </a>
          {pr.labels.map((label) => (
            <span key={label} className="pr-label">
              {label}
            </span>
          ))}
        </div>
        <div className="pr-meta">
          <span className="pr-ref">
            {showRepository ? pr.repository : ""}#{pr.number}
          </span>
          <span aria-hidden="true">·</span>
          {isBot(pr.author) ? (
            <Icon icon={Bot} size={13} />
          ) : (
            <span className="pr-avatar" aria-hidden="true">
              {login.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span>{login}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t("opened")} {format.relative(new Date(pr.createdAt), now)}
          </span>
          {reason !== null && <ReasonChip t={t} reason={reason} />}
        </div>
      </div>
      <div className="pr-stats">
        {pr.mergeable === "CONFLICTING" && (
          <span className="pr-stat" data-tone="amber">
            <Icon icon={TriangleAlert} size={14} />
            {t("conflicts")}
          </span>
        )}
        <span className="pr-stat pr-ci" data-tone={ci?.tone} title={ci?.label}>
          {ci !== null && (
            <span className={ci.spin === true ? "pr-spin" : undefined}>
              <Icon icon={ci.icon} label={ci.label} />
            </span>
          )}
        </span>
        <span className="pr-stat pr-review" data-tone={review.tone} title={review.label}>
          <Icon icon={review.icon} size={14} />
          <span aria-hidden="true">{review.text}</span>
          <span className="sr-only">{review.label}</span>
        </span>
        <span className="pr-stat pr-comments">
          <Icon icon={MessageSquare} size={14} label={t("pr_comments")} />
          {format.number(pr.commentCount)}
          {fresh && <span className="pr-new">{t("pr_new", { n: newCount })}</span>}
        </span>
        <span className="pr-stat pr-lines">
          <span className="sr-only">{t("pr_linesChanged")} </span>
          <span className="pr-add">+{format.number(pr.additions)}</span>{" "}
          <span className="pr-del">−{format.number(pr.deletions)}</span>
        </span>
        <span className="pr-stat pr-updated">
          <span className="sr-only">{t("pr_updated")} </span>
          {format.relative(new Date(pr.updatedAt), now)}
        </span>
        {/* Defence in depth: never an href GitHub did not give us (e.g. `javascript:`). */}
        {pr.url.startsWith("https://github.com/") && (
          <a href={pr.url} className="icon-button pr-github" target="_blank" rel="noreferrer">
            <Icon icon={ExternalLink} size={14} label={t("openGithub")} />
          </a>
        )}
      </div>
    </div>
  );
}
