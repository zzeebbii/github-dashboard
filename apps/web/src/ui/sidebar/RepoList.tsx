import { Link } from "@tanstack/react-router";
import { RefreshCw, Star } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { Repository } from "../../domain/favourites.ts";
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
  children,
}: {
  readonly nameWithOwner: string;
  readonly children?: ReactNode;
}) {
  const { owner, name } = splitName(nameWithOwner);
  return (
    // Owner and name truncate separately, so the visible parts are flex items, which an
    // accessible name would join with a space: the screen reader reads the whole name
    // from a hidden copy instead, and the title shows it on hover.
    <Link
      to="/repo/$owner/$name"
      params={{ owner, name }}
      className="repo-link"
      title={nameWithOwner}
    >
      <span className="sr-only">{nameWithOwner}</span>
      <span className="repo-name" aria-hidden="true">
        <span className="repo-owner">{owner}/</span>
        <span className="repo-short">{name}</span>
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
                  <span className="repo-link" data-unavailable="" title={favourite.nameWithOwner}>
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
                  <RepoLink nameWithOwner={favourite.nameWithOwner}>
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
  /** Already filtered and sorted; each shown as `owner/name`. */
  readonly repositories: readonly Repository[];
  readonly isFavourite: (nodeId: string) => boolean;
  readonly onToggleFavourite: (repository: RepoRef) => void;
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
  /** The search field (RepoSearch). */
  readonly search: ReactNode;
  /** Organisations GitHub would not show (OrgAccessNotice). */
  readonly orgNotice: ReactNode;
}

/** All repositories as one flat list, each named `owner/name` (FR-4.2). */
export function RepositoriesSection({
  t,
  status,
  repositories,
  isFavourite,
  onToggleFavourite,
  onRefresh,
  refreshing,
  search,
  orgNotice,
}: RepositoriesSectionProps) {
  const headingId = useId();

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
      {status === "ready" && repositories.length === 0 && (
        <p className="repo-note">{t("noRepos")}</p>
      )}
      <ul className="repo-rows">
        {repositories.map((repository) => (
          <li key={repository.id} className="repo-row">
            <RepoLink nameWithOwner={repository.nameWithOwner} />
            <StarButton
              t={t}
              repository={repository}
              pressed={isFavourite(repository.id)}
              onToggle={onToggleFavourite}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
