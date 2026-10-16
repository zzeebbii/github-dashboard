import { Bot, CircleAlert, CircleCheck, MessageSquare } from "lucide-react";
import type { createFormat, Translate } from "../../application/i18n.tsx";
import type { TimelineItem as Item } from "../../domain/pr-detail.ts";
import type { Actor, ReviewState } from "../../domain/pull-request.ts";
import { Icon } from "../Icon.tsx";
import { SafeHtml } from "../SafeHtml.tsx";

/** What every conversation part needs to render text, times and GitHub HTML. */
export interface PanelContext {
  readonly t: Translate;
  readonly format: ReturnType<typeof createFormat>;
  readonly now: Date;
  /** `useSanitizeHtml()`: every GitHub `bodyHTML` goes through SafeHtml (FR-6.6). */
  readonly sanitize: (dirty: string, imageLabel: string) => TrustedHTML | string;
  readonly imageLabel: string;
}

export const login = (actor: Actor | null) => actor?.login ?? "ghost";

/** A relative time with the exact one in `dateTime` and as a tooltip. */
export function When({ ctx, at }: { ctx: PanelContext; at: string | null }) {
  if (at === null) return null;
  const date = new Date(at);
  return (
    <time dateTime={at} title={ctx.format.date(date, { dateStyle: "medium", timeStyle: "short" })}>
      {ctx.format.relative(date, ctx.now)}
    </time>
  );
}

const REVIEW = {
  APPROVED: { icon: CircleCheck, tone: "green", key: "vApproved" },
  CHANGES_REQUESTED: { icon: CircleAlert, tone: "red", key: "vChanges" },
  COMMENTED: { icon: MessageSquare, tone: "muted", key: "vReviewed" },
  DISMISSED: { icon: MessageSquare, tone: "muted", key: "vReviewed" },
} as const satisfies Record<ReviewState, unknown>;

/** A comment or a review, after the design's `isComment` and `isReview` cards. */
export function TimelineItem({ ctx, item }: { ctx: PanelContext; item: Item }) {
  const { t } = ctx;
  const review = item.kind === "review" ? REVIEW[item.state] : null;
  const body = item.bodyHTML.trim();
  return (
    <article className="pp-card pp-item">
      <header className="pp-item-head">
        {review !== null && (
          <span className="pp-tone" data-tone={review.tone}>
            <Icon icon={review.icon} size={15} />
          </span>
        )}
        <strong>{login(item.author)}</strong>
        <span className="pp-muted">
          {t(review === null ? "commented" : review.key)} ·{" "}
          <When ctx={ctx} at={item.kind === "comment" ? item.createdAt : item.submittedAt} />
        </span>
      </header>
      {body !== "" && (
        <div className="pp-body">
          <SafeHtml html={body} sanitize={ctx.sanitize} imageLabel={ctx.imageLabel} />
        </div>
      )}
    </article>
  );
}

/** One bot's activity in a single collapsed card (FR-6.2), after the design's `isBotGroup`. */
export function BotGroup({
  ctx,
  author,
  items,
}: {
  ctx: PanelContext;
  author: Actor;
  items: readonly Item[];
}) {
  const { t } = ctx;
  return (
    <details className="pp-card pp-bots">
      <summary>
        <Icon icon={Bot} size={15} />
        <strong>{author.login}</strong>
        <span className="pp-muted">
          {items.length} {t(items.length === 1 ? "comment1" : "commentN")}
        </span>
      </summary>
      {items.map((item) => (
        <TimelineItem key={item.id} ctx={ctx} item={item} />
      ))}
    </details>
  );
}
