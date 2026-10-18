import { useRouter } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { GitHubError } from "../../application/github.ts";
import { useSanitizeHtml } from "../../application/html-sanitizer.ts";
import { applyPaneWidth, usePreferences } from "../../application/preferences-provider.tsx";
import { type Translate, useI18n } from "../../application/i18n.tsx";
import { usePrDetail, usePrHead } from "../../application/pr/use-pr-detail.ts";
import { useRefreshState } from "../../application/refresh-provider.tsx";
import { useSeen } from "../../application/seen.ts";
import type { Account } from "../../domain/account.ts";
import type { PullRequestRef } from "../../domain/pr-detail.ts";
import { checkOutcome, type ConversationFilter, conversation } from "../../domain/pr-panel.ts";
import type { PullRequest } from "../../domain/pull-request.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { Dialog } from "../../ui/Dialog.tsx";
import { ChecksTab } from "../../ui/pr-panel/ChecksTab.tsx";
import { ConversationTab } from "../../ui/pr-panel/ConversationTab.tsx";
import { DetailsTab } from "../../ui/pr-panel/DetailsTab.tsx";
import { PanelHeader, type PanelHeaderData } from "../../ui/pr-panel/PanelHeader.tsx";
import type { PanelContext } from "../../ui/pr-panel/TimelineItem.tsx";
import { OrgAccessNotice } from "../../ui/sidebar/OrgAccessNotice.tsx";
import { Splitter } from "../../ui/Splitter.tsx";
import { Tabs } from "../../ui/Tabs.tsx";

interface PrPanelProps {
  readonly account: Account;
  readonly pull: PullRequestRef;
  /** The list row it was opened from, when the list underneath has it (FR-6.5 cache key). */
  readonly row: PullRequest | null;
  /** Where closing goes when there is no previous view to go Back to (a deep link). */
  readonly exit: () => void;
}

const TABS = ["conversation", "checks", "details"] as const;
type PanelTab = (typeof TABS)[number];
const TAB_KEYS = { conversation: "tabConv", checks: "tabChecks", details: "tabDetails" } as const;

/** The app path of a PR's panel, which is also its list row's link (ui/pr/PrRow.tsx). */
const panelPath = (pull: PullRequestRef) => `/repo/${pull.owner}/${pull.name}/pull/${pull.number}`;

/** The panel's drag bounds; styles.css clamps `--pr-panel-width` to the same. */
const PANEL_MIN = 480;
const panelMax = (viewport: number) => viewport - 64;

/**
 * The PR detail panel (FR-6.1–6.9), a modal side sheet over the list it was opened from.
 *
 * - Focus: moves to the heading on open, wraps inside, Esc closes (ui/Dialog.tsx). On close
 *   it returns to the row whose link is this panel's path; without one (a deep link, or a
 *   filtered-out row), to `main`.
 * - Closing goes Back, so the list underneath keeps its tab, filters and scroll position and
 *   browser Back closes the panel too (FR-1.6). With no history to go back to, `exit`.
 * - Opening sets the seen marker (FR-6.8), deep links included; so does "Open in GitHub".
 * - Read-only (FR-6.9): no approve, comment, merge or re-run controls.
 * - Its left edge is a splitter (from 768 px); the width is a preference.
 */
export function PrPanel({ account, pull, row, exit }: PrPanelProps) {
  const router = useRouter();
  const headingId = useId();
  const sheetId = useId();
  const { updatePreferences } = usePreferences();
  const heading = useRef<HTMLHeadingElement>(null);
  const path = panelPath(pull);
  const close = () => {
    if (router.history.canGoBack()) router.history.back();
    else exit();
  };
  const returnFocus = () =>
    document.querySelector<HTMLElement>(`a.pr-title[href="${CSS.escape(path)}"]`) ??
    document.getElementById("main");
  const { t, format } = useI18n();
  const { now } = useRefreshState();
  const sanitize = useSanitizeHtml();
  const { markSeen } = useSeen(account.id);
  const resolved = usePrHead(account.id, pull, row);
  const head = resolved.head ?? { updatedAt: "", headSha: "" };
  // One tree from the first render, so the focused heading is never remounted.
  const detail = usePrDetail(
    { accountId: account.id, ref: pull, ...head },
    { enabled: resolved.head !== null },
  );
  const [tab, setTab] = useState<PanelTab>("conversation");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const pr = detail.pullRequest;

  const prId = pr?.id ?? row?.id ?? null;
  useEffect(() => {
    if (prId !== null) void markSeen(prId);
  }, [prId, markSeen]);

  const ctx: PanelContext = { t, format, now, sanitize, imageLabel: t("imageLabel") };
  const entries = pr === null ? [] : conversation(detail.timeline, pr.reviewThreads, filter);
  const failing = (detail.checks.data ?? []).filter((run) => checkOutcome(run) === "failed").length;

  const error = resolved.error ?? detail.detail.error;

  return (
    <Dialog
      id={sheetId}
      className="pr-sheet"
      aria-labelledby={headingId}
      onClose={close}
      initialFocus={heading}
      returnFocus={returnFocus}
    >
      <Splitter
        label={t("ly_resizePanel")}
        controls={sheetId}
        min={PANEL_MIN}
        max={panelMax}
        edge="left"
        onResize={(width) => {
          applyPaneWidth("prPanel", width);
        }}
        onCommit={(width) => {
          updatePreferences({ prPanelWidth: width });
        }}
      />
      <PanelHeader
        t={t}
        headingId={headingId}
        headingRef={heading}
        repository={`${pull.owner}/${pull.name}`}
        number={pull.number}
        onClose={close}
        pr={
          pr === null
            ? row === null
              ? null
              : fromRow(row)
            : { ...pr, author: pr.author?.login ?? null }
        }
        onOpenGitHub={() => {
          if (prId !== null) void markSeen(prId);
        }}
      />
      <div className="pp-content">
        {pr === null ? (
          <PanelMessage t={t} error={error?.error ?? null} />
        ) : (
          <Tabs
            label={t("pp_tabs")}
            tabs={TABS.map((id) => ({
              id,
              label: t(TAB_KEYS[id]),
              count: id === "checks" && failing > 0 ? format.number(failing) : undefined,
            }))}
            selected={tab}
            onSelect={setTab}
          >
            {tab === "conversation" && (
              <ConversationTab
                ctx={ctx}
                description={pr}
                entries={entries}
                filter={filter}
                onFilter={setFilter}
                hasMore={detail.hasMore}
                loadingMore={detail.detail.isFetchingNextPage}
                onLoadMore={detail.loadMore}
              />
            )}
            {tab === "checks" &&
              (detail.checks.data === undefined ? (
                <PanelMessage t={t} error={detail.checks.error?.error ?? null} />
              ) : (
                <ChecksTab ctx={ctx} runs={detail.checks.data} />
              ))}
            {tab === "details" && <DetailsTab ctx={ctx} pr={pr} />}
          </Tabs>
        )}
      </div>
    </Dialog>
  );
}

const fromRow = (row: PullRequest): PanelHeaderData => ({
  title: row.title,
  author: row.author?.login ?? null,
  state: "OPEN",
  isDraft: row.isDraft,
  baseRef: null,
  headRef: null,
  url: row.url,
});

function errorKey(error: GitHubError): MessageKey {
  switch (error.kind) {
    case "notFound":
      return "pp_notFound";
    case "forbidden":
    case "orgAccess":
      return "pp_noAccess";
    case "network":
      return "pp_network";
    case "rateLimited":
    case "secondaryLimit":
      return "pp_rateLimited";
    default:
      return "pp_error";
  }
}

/** Loading, or why GitHub returned nothing; an access problem also links to its fix. */
function PanelMessage({ t, error }: { t: Translate; error: GitHubError | null }) {
  if (error === null) {
    return (
      <p className="pp-notice" role="status">
        {t("pp_loading")}
      </p>
    );
  }
  return (
    <>
      <p className="pp-notice" role="alert">
        {t(errorKey(error))}
      </p>
      {error.kind === "orgAccess" && <OrgAccessNotice t={t} issues={[error.issue]} />}
    </>
  );
}
