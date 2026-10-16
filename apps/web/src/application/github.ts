import type { Account, AccountId } from "../domain/account.ts";
import type { FavouriteLookup, Repository } from "../domain/favourites.ts";
import type {
  CheckRun,
  PullRequestDetail,
  PullRequestRef,
  TimelinePage,
} from "../domain/pr-detail.ts";
import type { Result } from "../domain/result.ts";

/**
 * The GitHub read port (FR-3.1). The adapter in infrastructure/github/ is the only code
 * that talks to GitHub; features depend on this.
 */
export interface GitHubReadPort {
  /** The signed-in user, their organisations and the teams they belong to in each. */
  viewer(account: Account): Promise<GitHubResult<Viewer>>;
  /** One PR with its first 50 timeline items (FR-6.2). 1 GraphQL request. */
  getPullRequest(
    accountId: AccountId,
    ref: PullRequestRef,
  ): Promise<
    GitHubResult<{ readonly pullRequest: PullRequestDetail; readonly timeline: TimelinePage }>
  >;
  /** "Load more": the 50 timeline items after `after` (AC-6.5). 1 GraphQL request. */
  getTimelinePage(
    accountId: AccountId,
    ref: PullRequestRef,
    after: string,
  ): Promise<GitHubResult<TimelinePage>>;
  /** Check runs of the head commit, annotations for failing ones (FR-6.3). 1 GraphQL request. */
  getCheckRuns(
    accountId: AccountId,
    ref: PullRequestRef,
    headSha: string,
  ): Promise<GitHubResult<readonly CheckRun[]>>;
  /**
   * Every repository of the viewer and their organisations (FR-4.1), 100 per page. An
   * organisation GitHub hides is an `orgAccess` partial error; the rest still load.
   * 1 GraphQL request, plus 1 per further page of one connection (AC-4.1).
   */
  listRepos(accountId: AccountId): Promise<GitHubResult<readonly Repository[]>>;
  /**
   * Up to 25 favourites by node id, with their open PRs (FR-4.5, FR-4.7). One lookup per
   * id, in order. 1 GraphQL request.
   */
  refreshFavourites(
    accountId: AccountId,
    nodeIds: readonly string[],
  ): Promise<GitHubResult<readonly FavouriteLookup[]>>;
}

export interface Viewer {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string;
  readonly organizations: readonly Organization[];
}

interface Organization {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string;
  /** Slugs of the viewer's teams in this organisation. */
  readonly teams: readonly string[];
}

/** Why an organisation's data is missing, and where the user fixes it (FR-3.10). */
type OrgAccessReason = "sso" | "fineGrainedPolicy" | "appNotInstalled";

export interface OrgAccessIssue {
  /** null when GitHub's error does not say which organisation it is about. */
  readonly org: string | null;
  readonly reason: OrgAccessReason;
  readonly fixUrl: string;
}

/**
 * Every GitHub failure, mapped once in infrastructure/github/errors.ts (ADR-0020). The UI
 * renders from this, never from status codes. No member ever carries a token.
 */
export type GitHubError =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "forbidden"; readonly detail: string }
  | { readonly kind: "orgAccess"; readonly issue: OrgAccessIssue }
  | { readonly kind: "rateLimited"; readonly resetAt: Date }
  | { readonly kind: "secondaryLimit"; readonly retryAt: Date }
  | { readonly kind: "network" }
  | { readonly kind: "schema"; readonly detail: string }
  | { readonly kind: "notFound" };

/**
 * A success may still carry errors for the parts GitHub could not return (FR-3.11):
 * render `data`, and flag what `partialErrors` names in place.
 */
export type GitHubResult<T> = Result<
  { readonly data: T; readonly partialErrors: readonly GitHubError[] },
  GitHubError
>;
