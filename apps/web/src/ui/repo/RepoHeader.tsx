import {
  Building2,
  Clock,
  ExternalLink,
  GitPullRequest,
  Globe,
  Lock,
  type LucideIcon,
  Star,
} from "lucide-react";
import type { Translate } from "../../application/i18n.tsx";
import type { Repository } from "../../domain/favourites.ts";
import { Icon } from "../Icon.tsx";

interface RepoHeaderProps {
  readonly t: Translate;
  readonly owner: string;
  readonly name: string;
  /** null until the repository has loaded. */
  readonly visibility: Repository["visibility"] | null;
  readonly description: string | null;
  /** Formatted counts; null hides them (not known yet). */
  readonly openCount: string | null;
  readonly staleCount: string | null;
  /** The stale count's button: show the stale PRs. */
  readonly onShowStale: () => void;
  /** null hides the star, until the repository's id is known. */
  readonly favourite: { readonly pressed: boolean; readonly onToggle: () => void } | null;
  /** Only a github.com link is ever shown. */
  readonly githubUrl: string | null;
}

const visibilityView: Record<
  Repository["visibility"],
  { icon: LucideIcon; key: "rp_public" | "rp_private" | "rp_internal" }
> = {
  PUBLIC: { icon: Globe, key: "rp_public" },
  PRIVATE: { icon: Lock, key: "rp_private" },
  INTERNAL: { icon: Building2, key: "rp_internal" },
};

/**
 * The repository page's header, after the design (FR-4.6): owner / name, visibility,
 * description, open and stale counts, the favourite star and the GitHub link.
 */
export function RepoHeader(props: RepoHeaderProps) {
  const { t, owner, name, visibility, description, openCount, staleCount } = props;
  const { favourite, githubUrl, onShowStale } = props;
  const shownUrl = githubUrl?.startsWith("https://github.com/") === true ? githubUrl : null;
  return (
    <header className="repo-header">
      <div className="repo-title">
        <div className="repo-title-line">
          <h1>
            <span className="repo-owner">{owner} / </span>
            {name}
          </h1>
          {visibility !== null && (
            <span className="repo-visibility">
              <Icon icon={visibilityView[visibility].icon} size={12} />
              {t(visibilityView[visibility].key)}
            </span>
          )}
        </div>
        {visibility !== null && (
          <p className="repo-description">{description ?? t("rp_noDescription")}</p>
        )}
      </div>
      <div className="repo-actions">
        {openCount !== null && (
          <div className="repo-counts">
            <span className="repo-count">
              <Icon icon={GitPullRequest} size={14} />
              <strong>{openCount}</strong> {t("openSuffix")}
            </span>
            {staleCount !== null && (
              <button
                type="button"
                className="repo-count"
                title={t("rp_staleHint")}
                onClick={onShowStale}
              >
                <Icon icon={Clock} size={14} />
                <strong>{staleCount}</strong> {t("stale")}
              </button>
            )}
          </div>
        )}
        {favourite !== null && (
          <button
            type="button"
            className="repo-button repo-favourite"
            aria-pressed={favourite.pressed}
            onClick={favourite.onToggle}
          >
            <Icon icon={Star} size={14} />
            {t("favorite")}
          </button>
        )}
        {shownUrl !== null && (
          <a className="repo-button" href={shownUrl} target="_blank" rel="noopener noreferrer">
            <Icon icon={ExternalLink} size={14} />
            {t("openGithub")}
          </a>
        )}
      </div>
    </header>
  );
}
