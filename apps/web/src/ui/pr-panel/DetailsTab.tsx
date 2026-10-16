import { Check, CircleAlert, Clock, MessageSquare, Users } from "lucide-react";
import { useId } from "react";
import type { MergeStateStatus, PullRequestDetail } from "../../domain/pr-detail.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { Icon } from "../Icon.tsx";
import { type PanelContext, When } from "./TimelineItem.tsx";

/** GitHub's exact merge state, in words (FR-6.4). */
const MERGE_STATE: Record<MergeStateStatus, { key: MessageKey; tone: string }> = {
  CLEAN: { key: "pp_ms_CLEAN", tone: "green" },
  HAS_HOOKS: { key: "pp_ms_HAS_HOOKS", tone: "green" },
  UNSTABLE: { key: "pp_ms_UNSTABLE", tone: "amber" },
  BEHIND: { key: "pp_ms_BEHIND", tone: "amber" },
  BLOCKED: { key: "pp_ms_BLOCKED", tone: "red" },
  DIRTY: { key: "pp_ms_DIRTY", tone: "red" },
  DRAFT: { key: "pp_ms_DRAFT", tone: "muted" },
  UNKNOWN: { key: "pr_mergeChecking", tone: "muted" },
};

const REVIEW = {
  APPROVED: { icon: Check, tone: "green", key: "approved" },
  CHANGES_REQUESTED: { icon: CircleAlert, tone: "red", key: "r_changesRequested" },
  COMMENTED: { icon: MessageSquare, tone: "muted", key: "pp_commented" },
  DISMISSED: { icon: MessageSquare, tone: "muted", key: "pp_dismissed" },
  PENDING: { icon: Clock, tone: "muted", key: "pp_pending" },
} as const;

/**
 * The Details tab (FR-6.4): reviewers with their state, then merge state, branches,
 * assignees, labels, milestone and times.
 */
export function DetailsTab({ ctx, pr }: { ctx: PanelContext; pr: PullRequestDetail }) {
  const { t } = ctx;
  const reviewersId = useId();
  const reviewers = [
    ...pr.reviews.map((review) => ({
      name: review.author?.login ?? "ghost",
      team: false,
      state: review.state,
    })),
    ...pr.reviewRequests.map((request) =>
      request.kind === "user"
        ? { name: request.login, team: false, state: "PENDING" as const }
        : { name: `@${request.team}`, team: true, state: "PENDING" as const },
    ),
  ];
  const merge = MERGE_STATE[pr.mergeStateStatus];
  const none = <span className="pp-muted">{t("pp_none")}</span>;
  return (
    <div className="pp-details">
      <section className="pp-card" aria-labelledby={reviewersId}>
        <h3 id={reviewersId} className="pp-card-title">
          {t("reviewers")}
        </h3>
        {reviewers.length === 0 ? (
          <p className="pp-row pp-muted">{t("pr_noReviewers")}</p>
        ) : (
          <ul>
            {reviewers.map((reviewer) => {
              const review = REVIEW[reviewer.state];
              return (
                <li key={reviewer.name} className="pp-row">
                  {reviewer.team && <Icon icon={Users} size={14} />}
                  <span className="pp-reviewer">{reviewer.name}</span>
                  <span className="pp-badge" data-tone={review.tone}>
                    <Icon icon={review.icon} size={12} />
                    {t(review.key)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <dl className="pp-card pp-facts">
        <div className="pp-row">
          <dt>{t("pp_mergeState")}</dt>
          <dd>
            <span className="pp-badge" data-tone={merge.tone}>
              {t(merge.key)}
            </span>
          </dd>
        </div>
        <div className="pp-row">
          <dt>{t("pp_branch")}</dt>
          <dd>
            <code>{pr.headRef}</code> → <code>{pr.baseRef}</code>
          </dd>
        </div>
        <div className="pp-row">
          <dt>{t("pp_assignees")}</dt>
          <dd>{pr.assignees.length === 0 ? none : pr.assignees.join(", ")}</dd>
        </div>
        <div className="pp-row">
          <dt>{t("pp_labels")}</dt>
          <dd className="pp-labels">
            {pr.labels.length === 0
              ? none
              : pr.labels.map((label) => (
                  <span key={label.name} className="pr-label">
                    {label.name}
                  </span>
                ))}
          </dd>
        </div>
        <div className="pp-row">
          <dt>{t("pp_milestone")}</dt>
          <dd>{pr.milestone ?? none}</dd>
        </div>
        <div className="pp-row">
          <dt>{t("pp_created")}</dt>
          <dd>
            <When ctx={ctx} at={pr.createdAt} />
          </dd>
        </div>
        <div className="pp-row">
          <dt>{t("pr_updated")}</dt>
          <dd>
            <When ctx={ctx} at={pr.updatedAt} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
