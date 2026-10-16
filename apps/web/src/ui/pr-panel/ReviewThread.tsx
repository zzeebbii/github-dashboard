import { CircleCheck, FileCode } from "lucide-react";
import type { ReviewThread as Thread } from "../../domain/pr-detail.ts";
import { Icon } from "../Icon.tsx";
import { SafeHtml } from "../SafeHtml.tsx";
import { login, type PanelContext, When } from "./TimelineItem.tsx";

/**
 * The last lines of a diff hunk: the commented line is the last one.
 *
 * ponytail: a fixed 6-line window; let it expand when a real review needs more context.
 */
const SNIPPET_LINES = 6;
const snippet = (hunk: string) =>
  hunk
    .split("\n")
    .filter((line) => !line.startsWith("@@"))
    .slice(-SNIPPET_LINES);
const sign = (line: string) => (line.startsWith("+") ? "+" : line.startsWith("-") ? "-" : " ");

/**
 * A review thread (FR-6.2): file, line, the diff snippet and every comment. Resolved
 * threads start collapsed, as in the design. Read-only: no resolve button (FR-6.9).
 */
export function ReviewThread({ ctx, thread }: { ctx: PanelContext; thread: Thread }) {
  const { t } = ctx;
  const hunk = thread.comments[0]?.diffHunk ?? "";
  return (
    <details className="pp-card pp-thread" open={!thread.isResolved}>
      <summary>
        <Icon icon={FileCode} size={14} />
        <code>
          {thread.path}
          {thread.line !== null && <span className="pp-muted">:{thread.line}</span>}
        </code>
        <span className="pp-muted">
          {thread.comments.length} {t(thread.comments.length === 1 ? "comment1" : "commentN")}
        </span>
        {thread.isOutdated && <span className="pp-badge">{t("pp_outdated")}</span>}
        {thread.isResolved && (
          <span className="pp-badge" data-tone="purple">
            <Icon icon={CircleCheck} size={12} />
            {t("resolved")}
          </span>
        )}
      </summary>
      {hunk !== "" && (
        <pre className="pp-diff">
          {snippet(hunk).map((line, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- reason: a snippet's lines are static and may repeat; their position is their identity
            <span key={index} className="pp-diff-line" data-sign={sign(line)}>
              {line === "" ? " " : line}
            </span>
          ))}
        </pre>
      )}
      {thread.comments.map((comment) => (
        <div key={comment.id} className="pp-reply">
          <div className="pp-item-head">
            <strong>{login(comment.author)}</strong>
            <span className="pp-muted">
              <When ctx={ctx} at={comment.createdAt} />
            </span>
          </div>
          <div className="pp-body">
            <SafeHtml html={comment.bodyHTML} sanitize={ctx.sanitize} imageLabel={ctx.imageLabel} />
          </div>
        </div>
      ))}
    </details>
  );
}
