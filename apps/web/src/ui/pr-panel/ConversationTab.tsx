import type { Actor } from "../../domain/pull-request.ts";
import {
  CONVERSATION_FILTERS,
  type ConversationEntry,
  type ConversationFilter,
} from "../../domain/pr-panel.ts";
import { SafeHtml } from "../SafeHtml.tsx";
import { ReviewThread } from "./ReviewThread.tsx";
import { BotGroup, login, type PanelContext, TimelineItem, When } from "./TimelineItem.tsx";

interface ConversationTabProps {
  readonly ctx: PanelContext;
  /** The PR's own description. */
  readonly description: {
    readonly author: Actor | null;
    readonly createdAt: string;
    readonly bodyHTML: string;
  };
  readonly entries: readonly ConversationEntry[];
  readonly filter: ConversationFilter;
  readonly onFilter: (filter: ConversationFilter) => void;
  /** "Load more": the next 50 timeline items (AC-6.5). */
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onLoadMore: () => void;
}

const FILTER_KEYS = { all: "pAll", unresolved: "pUnresolved", humans: "pHumans" } as const;

/**
 * The Conversation tab (FR-6.2): All / Unresolved / Humans presets, the description, then
 * comments, reviews and review threads by time, bots collapsed.
 */
export function ConversationTab({
  ctx,
  description,
  entries,
  filter,
  onFilter,
  hasMore,
  loadingMore,
  onLoadMore,
}: ConversationTabProps) {
  const { t } = ctx;
  return (
    <div className="pp-conversation">
      <div className="pp-presets" role="group" aria-label={t("filters")}>
        {CONVERSATION_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            className="pp-preset"
            aria-pressed={id === filter}
            onClick={() => onFilter(id)}
          >
            {t(FILTER_KEYS[id])}
          </button>
        ))}
      </div>
      {filter !== "unresolved" && (
        <details className="pp-card pp-description" open>
          <summary>
            <strong>{login(description.author)}</strong>
            <span className="pp-muted">
              {t("opened")} <When ctx={ctx} at={description.createdAt} /> · {t("description")}
            </span>
          </summary>
          <div className="pp-body">
            {description.bodyHTML.trim() === "" ? (
              <p className="pp-muted">{t("rp_noDescription")}</p>
            ) : (
              <SafeHtml
                html={description.bodyHTML}
                sanitize={ctx.sanitize}
                imageLabel={ctx.imageLabel}
              />
            )}
          </div>
        </details>
      )}
      {entries.length === 0 ? (
        <p className="pp-card pp-empty">{t("noMatch")}</p>
      ) : (
        <ol className="pp-timeline">
          {entries.map((entry) => (
            <li key={entryKey(entry)}>
              {entry.kind === "item" ? (
                <TimelineItem ctx={ctx} item={entry.item} />
              ) : entry.kind === "thread" ? (
                <ReviewThread ctx={ctx} thread={entry.thread} />
              ) : (
                <BotGroup ctx={ctx} author={entry.author} items={entry.items} />
              )}
            </li>
          ))}
        </ol>
      )}
      {hasMore && filter !== "unresolved" && (
        <button
          type="button"
          className="repo-button repo-load-more"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {t("rp_loadMore")}
        </button>
      )}
    </div>
  );
}

function entryKey(entry: ConversationEntry): string {
  if (entry.kind === "item") return entry.item.id;
  if (entry.kind === "thread") return entry.thread.id;
  return `bot:${entry.author.login}`;
}
