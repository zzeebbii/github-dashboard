import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAccounts } from "../../application/auth-provider.tsx";
import type { GitHubError } from "../../application/github.ts";
import { useNewCounts } from "../../application/home/use-home.ts";
import { useI18n } from "../../application/i18n.tsx";
import { applyPrFilters, usePrFilters } from "../../application/pr-filters.ts";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { useRefreshState } from "../../application/refresh-provider.tsx";
import { useFavourites } from "../../application/repos/use-favourites.ts";
import { useRepoPage } from "../../application/repos/use-repo-page.ts";
import type { Account } from "../../domain/account.ts";
import { isStale } from "../../domain/activity.ts";
import type { PullRequest } from "../../domain/pull-request.ts";
import { inRepoTab, REPO_TABS, type RepoTab } from "../../domain/repo-tabs.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { FilterBar } from "../../ui/pr/FilterBar.tsx";
import { PrList } from "../../ui/pr/PrList.tsx";
import type { PrRowData } from "../../ui/pr/PrRow.tsx";
import { RepoHeader } from "../../ui/repo/RepoHeader.tsx";
import { RepoTabs } from "../../ui/repo/RepoTabs.tsx";

interface RepoPageProps {
  readonly owner: string;
  readonly name: string;
  readonly tab: RepoTab;
  /** Where the PR panel route renders, over this page. */
  readonly children?: ReactNode;
}

/** `/repo/$owner/$name`. The app route requires an account; without one, just the title. */
export function RepoPage({ owner, name, tab, children }: RepoPageProps) {
  const { activeAccount } = useAccounts();
  if (activeAccount === null) {
    return (
      <>
        <h1>
          {owner} / {name}
        </h1>
        {children}
      </>
    );
  }
  return (
    <Repo account={activeAccount} owner={owner} name={name} tab={tab}>
      {children}
    </Repo>
  );
}

function errorKey(error: GitHubError): MessageKey {
  if (error.kind === "notFound") return "rp_notFound";
  if (error.kind === "forbidden" || error.kind === "orgAccess") return "rp_noAccess";
  return "rp_error";
}

/** The search params with `tab` set; the default tab is left out of the URL. */
function withTab<T extends { tab?: RepoTab }>(search: T, tab: RepoTab): T {
  const next = { ...search };
  delete next.tab;
  return tab === "open" ? next : { ...next, tab };
}

/**
 * The repository page (FR-4.6): header, Open / Draft / Needs review tabs with counts, the
 * URL-backed filter bar, and the open PRs as shared rows, 20 per page with "Load more". The
 * tab is in the URL, so a reload keeps it. Opening a row or "Open in GitHub" sets its seen
 * marker, as on Home (FR-5.8).
 *
 * Counts cover the loaded PRs; while more pages remain they read "20+". The open count is
 * GitHub's own total, and before the page loads it comes from the favourites batch when the
 * repository is a favourite. That batch's rows carry no reviews or CI
 * (docs/architecture/github-query-costs.md), so the rows always wait for the page's query.
 */
function Repo({ account, owner, name, tab, children }: RepoPageProps & { account: Account }) {
  const { t, format } = useI18n();
  const { density } = usePreferences().preferences;
  const { now } = useRefreshState();
  const { filters, update, reset } = usePrFilters();
  const navigate = useNavigate();
  const repo = useRepoPage(account, { owner, name });
  const favourites = useFavourites(account.id);
  const { newCount, markSeen } = useNewCounts(account, repo.pullRequests);

  const lowerName = `${owner}/${name}`.toLowerCase();
  const stored = favourites.statuses.find(
    ({ favourite }) =>
      favourite.nodeId === repo.repository?.id ||
      favourite.nameWithOwner.toLowerCase() === lowerName,
  );
  const target =
    repo.repository ??
    (stored === undefined
      ? null
      : { id: stored.favourite.nodeId, nameWithOwner: stored.favourite.nameWithOwner });
  const openCount = repo.openCount ?? (stored?.state === "available" ? stored.openCount : null);

  const prs = repo.pullRequests;
  const loaded = !repo.isPending && repo.error === null;
  const count = (n: number) => `${format.number(n)}${repo.hasMore ? "+" : ""}`;
  const tabs = REPO_TABS.map((id) => ({
    id,
    count:
      id === "open"
        ? format.number(openCount ?? prs.length)
        : count(prs.filter((pr) => inRepoTab(pr, id)).length),
  }));
  const labelCounts = new Map<string, number>();
  for (const label of prs.flatMap((pr) => pr.labels)) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const setSearch = (next: RepoTab, patch: { updated?: "stale" } = {}) =>
    void navigate({
      to: "/repo/$owner/$name",
      params: { owner, name },
      search: (prev) => ({ ...withTab(prev, next), ...patch }),
      replace: true,
    });

  function toRowData(pr: PullRequest): PrRowData {
    const params = { owner, name, number: String(pr.number) };
    return {
      pr,
      reason: null,
      newCount: newCount(pr),
      href: `/repo/${owner}/${name}/pull/${pr.number}`,
      onOpen: () => {
        void markSeen(pr.id);
        void navigate({ to: "/repo/$owner/$name/pull/$number", params, search: (prev) => prev });
      },
      onOpenGitHub: () => void markSeen(pr.id),
    };
  }

  const visible = applyPrFilters(
    prs.filter((pr) => inRepoTab(pr, tab)),
    filters,
    { viewerLogin: account.login, now },
  );

  return (
    <>
      <RepoHeader
        t={t}
        owner={owner}
        name={name}
        visibility={repo.repository?.visibility ?? null}
        description={repo.repository?.description ?? null}
        openCount={openCount === null ? null : format.number(openCount)}
        staleCount={loaded ? count(prs.filter((pr) => isStale(pr, now)).length) : null}
        onShowStale={() => setSearch("open", { updated: "stale" })}
        favourite={
          target === null
            ? null
            : {
                pressed: favourites.isFavourite(target.id),
                onToggle: () => favourites.toggle(target),
              }
        }
        githubUrl={repo.repository?.url ?? null}
      />
      {repo.error !== null ? (
        <p className="home-notice" role="alert">
          {t(errorKey(repo.error))}
        </p>
      ) : repo.isPending ? (
        <p className="home-notice" role="status">
          {t("hm_loading")}
        </p>
      ) : (
        <RepoTabs
          t={t}
          label={t("pullRequests")}
          tabs={tabs}
          selected={tab}
          onSelect={(next) => setSearch(next)}
        >
          <FilterBar
            t={t}
            filters={filters}
            labels={[...labelCounts].map(([label, n]) => ({ name: label, count: n }))}
            onChange={update}
            onReset={reset}
          />
          <PrList
            t={t}
            format={format}
            now={now}
            density={density}
            showRepository={false}
            label={t(`rt_${tab}`)}
            rows={visible.map(toRowData)}
          />
          {repo.hasMore && (
            <button
              type="button"
              className="repo-button repo-load-more"
              disabled={repo.isLoadingMore}
              onClick={repo.loadMore}
            >
              {t("rp_loadMore")}
            </button>
          )}
        </RepoTabs>
      )}
      {children}
    </>
  );
}
