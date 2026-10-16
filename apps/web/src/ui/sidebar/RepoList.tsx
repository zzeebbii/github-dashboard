import { Link } from "@tanstack/react-router";
import { ChevronRight, RefreshCw, Star } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { Repository } from "../../domain/favourites.ts";
import type { OwnerGroup } from "../../domain/repo-search.ts";
import { Icon } from "../Icon.tsx";

/** A favourite as the sidebar shows it (FR-4.2, FR-4.7). */
export interface FavouriteRow {
  readonly nodeId: string;
  readonly nameWithOwner: string;
  readonly state: "available" | "unavailable" | "pending";
  /** Open PRs, known once a refresh found the repository. */
  readonly openCount: number | null;
}

type RepoRef = Pick<Repository, "id" | "nameWithOwner">;

function splitName(nameWithOwner: string): { owner: string; name: string } {
  const slash = nameWithOwner.indexOf("/");
  return { owner: nameWithOwner.slice(0, slash), name: nameWithOwner.slice(slash + 1) };
}

function Count({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <span className="repo-count">
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A real toggle button (AC-4.3): the name stays, `aria-pressed` says whether it is on. */
function StarButton({
  t,
  repository,
  pressed,
  onToggle,
}: {
  readonly t: Translate;
  readonly repository: RepoRef;
  readonly pressed: boolean;
  readonly onToggle: (repository: RepoRef) => void;
}) {
  return (
    <button
      type="button"
      className="repo-star"
      aria-pressed={pressed}
      aria-label={t("sb_favourite", { repo: repository.nameWithOwner })}
      onClick={() => {
        onToggle(repository);
      }}
    >
      <Icon icon={Star} size={14} />
    </button>
  );
}

/** A link to `/repo/$owner/$name`: SPA navigation, and it closes the drawer (Drawer.tsx). */
function RepoLink({
  nameWithOwner,
  showOwner,
  children,
}: {
  readonly nameWithOwner: string;
  readonly showOwner: boolean;
  readonly children?: ReactNode;
}) {
  const { owner, name } = splitName(nameWithOwner);
  return (
    <Link to="/repo/$owner/$name" params={{ owner, name }} className="repo-link">
      <span className="repo-name">
        {showOwner && <span className="repo-owner">{owner}/</span>}
        {name}
      </span>
      {children}
    </Link>
  );
}

interface FavouritesSectionProps {
  readonly t: Translate;
  readonly favourites: readonly FavouriteRow[];
  /** FR-4.8: shown above 50 favourites. */
  readonly costNotice: string | null;
  readonly onToggle: (repository: RepoRef) => void;
  readonly onRemove: (nodeId: string) => void;
}

/** Favourites, with live open-PR counts, above all repositories (FR-4.2). */
export function FavouritesSection({
  t,
  favourites,
  costNotice,
  onToggle,
  onRemove,
}: FavouritesSectionProps) {
  const headingId = useId();
  return (
    <section className="repo-section" aria-labelledby={headingId}>
      <div className="repo-section-head">
        <h2 id={headingId}>{t("favorites")}</h2>
      </div>
      {costNotice !== null && <p className="repo-note">{costNotice}</p>}
      {favourites.length === 0 ? (
        <p className="repo-note">{t("sb_noFavourites")}</p>
      ) : (
        <ul className="repo-rows">
          {favourites.map((favourite) => (
            <li key={favourite.nodeId} className="repo-row">
              {favourite.state === "unavailable" ? (
                <>
                  <span className="repo-link" data-unavailable="">
                    <span className="repo-name">{favourite.nameWithOwner}</span>
                    <span className="repo-badge">{t("sb_unavailable")}</span>
                  </span>
                  <button
                    type="button"
                    className="repo-remove"
                    aria-label={t("sb_removeFavourite", { repo: favourite.nameWithOwner })}
                    onClick={() => {
                      onRemove(favourite.nodeId);
                    }}
                  >
                    {t("sb_remove")}
                  </button>
                </>
              ) : (
                <>
                  <RepoLink nameWithOwner={favourite.nameWithOwner} showOwner>
                    {favourite.openCount !== null && (
                      <Count
                        value={favourite.openCount}
                        label={t("sb_openPrs", { n: favourite.openCount })}
                      />
                    )}
                  </RepoLink>
                  <StarButton
                    t={t}
                    repository={{ id: favourite.nodeId, nameWithOwner: favourite.nameWithOwner }}
                    pressed
                    onToggle={onToggle}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface RepositoriesSectionProps {
  readonly t: Translate;
  readonly status: "loading" | "error" | "ready";
  readonly groups: readonly OwnerGroup[];
  readonly isFavourite: (nodeId: string) => boolean;
  readonly onToggleFavourite: (repository: RepoRef) => void;
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
  /** The search field (RepoSearch). */
  readonly search: ReactNode;
  /** Organisations GitHub would not show (OrgAccessNotice). */
  readonly orgNotice: ReactNode;
}

/** All repositories, grouped by owner, each group collapsible (FR-4.2). */
export function RepositoriesSection({
  t,
  status,
  groups,
  isFavourite,
  onToggleFavourite,
  onRefresh,
  refreshing,
  search,
  orgNotice,
}: RepositoriesSectionProps) {
  const headingId = useId();
  const listId = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (owner: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(owner)) next.add(owner);
      return next;
    });
  };

  return (
    <section className="repo-section" aria-labelledby={headingId}>
      <div className="repo-section-head">
        <h2 id={headingId}>{t("repositories")}</h2>
        <button
          type="button"
          className="repo-refresh"
          aria-label={t("sb_refresh")}
          title={t("sb_refresh")}
          // aria-disabled, not disabled: a disabled button would drop keyboard focus.
          aria-disabled={refreshing}
          onClick={() => {
            if (!refreshing) onRefresh();
          }}
        >
          <Icon icon={RefreshCw} size={14} />
        </button>
      </div>
      {search}
      {orgNotice}
      {status === "loading" && <p className="repo-note">{t("sb_loading")}</p>}
      {status === "error" && <p className="repo-note">{t("sb_loadFailed")}</p>}
      {status === "ready" && groups.length === 0 && <p className="repo-note">{t("noRepos")}</p>}
      <ul className="repo-groups">
        {groups.map((group, index) => {
          const open = !collapsed.has(group.owner);
          const groupListId = `${listId}-${index}`;
          return (
            <li key={group.owner}>
              <h3 className="repo-group-head">
                <button
                  type="button"
                  className="repo-group-toggle"
                  aria-expanded={open}
                  aria-controls={groupListId}
                  onClick={() => {
                    toggle(group.owner);
                  }}
                >
                  <Icon icon={ChevronRight} size={14} />
                  <span className="repo-name">{group.owner}</span>
                  <Count
                    value={group.repositories.length}
                    label={t("sb_repoCount", { n: group.repositories.length })}
                  />
                </button>
              </h3>
              <ul id={groupListId} className="repo-rows" hidden={!open}>
                {open &&
                  group.repositories.map((repository) => (
                    <li key={repository.id} className="repo-row">
                      <RepoLink nameWithOwner={repository.nameWithOwner} showOwner={false} />
                      <StarButton
                        t={t}
                        repository={repository}
                        pressed={isFavourite(repository.id)}
                        onToggle={onToggleFavourite}
                      />
                    </li>
                  ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
