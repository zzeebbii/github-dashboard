import { useState } from "react";
import { useAccounts } from "../../application/auth-provider.tsx";
import type { OrgAccessIssue } from "../../application/github.ts";
import { useT } from "../../application/i18n.tsx";
import { useFavourites } from "../../application/repos/use-favourites.ts";
import { useRepos } from "../../application/repos/use-repos.ts";
import type { AccountId } from "../../domain/account.ts";
import { type Repository, batchesOf } from "../../domain/favourites.ts";
import { groupByOwner, parseRepoSearch } from "../../domain/repo-search.ts";
import { OrgAccessNotice } from "../../ui/sidebar/OrgAccessNotice.tsx";
import {
  type FavouriteRow,
  FavouritesSection,
  RepositoriesSection,
} from "../../ui/sidebar/RepoList.tsx";
import { RepoSearch } from "../../ui/sidebar/RepoSearch.tsx";

/** The sidebar's Favourites and Repositories sections for the active account (FR-4.2, 4.3). */
export function RepositoriesContainer() {
  const { activeAccount } = useAccounts();
  if (activeAccount === null) return null;
  // Keyed: switching accounts starts with a fresh search and fresh groups.
  return <Repositories key={activeAccount.id} accountId={activeAccount.id} />;
}

/** Each organisation once, from the repository list and the favourites refresh. */
function uniqueIssues(issues: readonly OrgAccessIssue[]): OrgAccessIssue[] {
  const seen = new Map<string, OrgAccessIssue>();
  for (const issue of issues) seen.set(`${issue.org ?? ""}:${issue.reason}`, issue);
  return [...seen.values()];
}

function Repositories({ accountId }: { readonly accountId: AccountId }) {
  const t = useT();
  const repos = useRepos(accountId);
  const favourites = useFavourites(accountId);
  const [query, setQuery] = useState("");

  // Filters the cached list only: typing never asks GitHub (FR-4.3).
  const search = parseRepoSearch(query);
  const matching = repos.repositories.filter((r) => search.matches(r.nameWithOwner));
  const issues = uniqueIssues([
    ...repos.orgAccessIssues,
    ...favourites.partialErrors.flatMap((e) => (e.kind === "orgAccess" ? [e.issue] : [])),
  ]);
  const rows = favourites.statuses.map((status): FavouriteRow => ({
    nodeId: status.favourite.nodeId,
    nameWithOwner: status.favourite.nameWithOwner,
    state: status.state,
    openCount: status.state === "available" ? status.openCount : null,
  }));
  const { query: list } = repos;
  const toggle = (repository: Pick<Repository, "id" | "nameWithOwner">) => {
    favourites.toggle(repository);
  };

  return (
    <>
      <FavouritesSection
        t={t}
        favourites={rows}
        costNotice={
          favourites.showCostNotice
            ? t("sb_costNotice", { n: rows.length, r: batchesOf(rows).length })
            : null
        }
        onToggle={toggle}
        onRemove={favourites.remove}
      />
      <RepositoriesSection
        t={t}
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        groups={groupByOwner(matching)}
        isFavourite={favourites.isFavourite}
        onToggleFavourite={toggle}
        onRefresh={repos.refresh}
        refreshing={list.isFetching}
        search={
          <RepoSearch
            t={t}
            value={query}
            onChange={setQuery}
            mode={search.mode}
            matchCount={matching.length}
          />
        }
        orgNotice={<OrgAccessNotice t={t} issues={issues} />}
      />
    </>
  );
}
