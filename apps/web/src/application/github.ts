import type { Account } from "../domain/account.ts";
import type { Result } from "../domain/result.ts";

/**
 * The GitHub read port (FR-3.1). The adapter in infrastructure/github/ is the only code
 * that talks to GitHub; features depend on this. Viewer, organisations and teams now;
 * T16, T20 and T22 add the repo list, favourites, Home sections and PR detail.
 */
export interface GitHubReadPort {
  /** The signed-in user, their organisations and the teams they belong to in each. */
  viewer(account: Account): Promise<GitHubResult<Viewer>>;
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
