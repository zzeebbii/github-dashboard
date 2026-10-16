import {
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import type { Translate } from "../../application/i18n.tsx";
import { Icon } from "../Icon.tsx";

export interface PanelHeaderData {
  readonly title: string;
  readonly author: string | null;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly isDraft: boolean;
  /** Unknown until the detail has loaded. */
  readonly baseRef: string | null;
  readonly headRef: string | null;
  readonly url: string;
}

interface PanelHeaderProps {
  readonly t: Translate;
  readonly headingId: string;
  /** Focused when the panel opens (FR-6.7). */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  /** `owner/name`. */
  readonly repository: string;
  readonly number: number;
  /** null while nothing about the PR is known yet. */
  readonly pr: PanelHeaderData | null;
  readonly onClose: () => void;
  /** "Open in GitHub" was followed (FR-6.8 sets the seen marker). */
  readonly onOpenGitHub: () => void;
}

const STATE = {
  MERGED: { icon: GitMerge, tone: "purple", key: "pp_merged" },
  CLOSED: { icon: GitPullRequestClosed, tone: "red", key: "rt_closed" },
  DRAFT: { icon: GitPullRequestDraft, tone: "muted", key: "rt_draft" },
  OPEN: { icon: GitPullRequest, tone: "green", key: "rt_open" },
} as const;

/**
 * The sheet's header, after the design: repository and close button, state, title and
 * number, "author wants to merge into base from head", and "Open in GitHub". No approve or
 * re-run buttons: the dashboard is read-only (FR-6.9).
 */
export function PanelHeader({
  t,
  headingId,
  headingRef,
  repository,
  number,
  pr,
  onClose,
  onOpenGitHub,
}: PanelHeaderProps) {
  const state = pr === null ? null : STATE[pr.isDraft && pr.state === "OPEN" ? "DRAFT" : pr.state];
  return (
    <header className="pp-header">
      <div className="pp-bar">
        <span className="pp-repo">{repository}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t("closePanel")}
        >
          <Icon icon={X} />
        </button>
      </div>
      <div className="pp-title-row">
        {state !== null && (
          <span className="pp-state" data-tone={state.tone}>
            <Icon icon={state.icon} size={20} label={t(state.key)} />
          </span>
        )}
        <div className="pp-title-block">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="pp-title">
            {pr === null ? (
              t("pullNumber", { n: number })
            ) : (
              <>
                {pr.title} <span className="pp-number">#{number}</span>
              </>
            )}
          </h2>
          {pr !== null && pr.author !== null && (
            <p className="pp-merge-line">
              <strong>{pr.author}</strong> {t("wantsMerge")}{" "}
              {pr.baseRef !== null && <code>{pr.baseRef}</code>}
              {pr.headRef !== null && (
                <>
                  {" "}
                  {t("from")} <code>{pr.headRef}</code>
                </>
              )}
            </p>
          )}
        </div>
        {/* Defence in depth: never an href GitHub did not give us (e.g. `javascript:`). */}
        {pr?.url.startsWith("https://github.com/") === true && (
          <a
            href={pr.url}
            className="pp-button"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpenGitHub}
          >
            <Icon icon={ExternalLink} size={14} />
            {t("openGithub")}
          </a>
        )}
      </div>
    </header>
  );
}
