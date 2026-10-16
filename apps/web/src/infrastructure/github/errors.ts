import { redact } from "../../application/auth.ts";
import type { GitHubError, OrgAccessIssue } from "../../application/github.ts";
import type { GraphQLErrorEntry } from "./schemas/graphql.ts";

/**
 * The ONE place GitHub status codes, headers and GraphQL `errors` are read (ADR-0020).
 * The mapping prefers the GraphQL error `type`, then documented message phrases. A GitHub
 * wording change is absorbed here and nowhere else.
 *
 * Phrases, and where they come from (recorded SSO/policy fixtures are still owed, so
 * these fixtures are marked `_synthetic`):
 * - "Resource protected by organization SAML enforcement": GitHub's SAML error, as quoted
 *   in https://github.com/desktop/desktop/pull/8910 and matched by T9's permission probe.
 * - "forbids access via a fine-grained personal access token": an organisation's
 *   fine-grained PAT policy (lifetime limit) refusing the token.
 * - "Resource not accessible by personal access token" / "… by integration": documented in
 *   https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api
 */

const SAML = /SAML enforcement/i;
const FINE_GRAINED_POLICY = /forbids access via a fine-grained personal access token/i;
const NOT_ACCESSIBLE_BY_PAT = /not accessible by personal access token/i;
const NOT_ACCESSIBLE_BY_APP = /not accessible by integration/i;
const SECONDARY = /secondary rate limit/i;

const TOKENS_SETTINGS = "https://github.com/settings/tokens";
const FINE_GRAINED_SETTINGS = "https://github.com/settings/personal-access-tokens";
// ponytail: generic installations page; point at the app's own install URL once GitHub App
// auth lands and the app slug is configured.
const INSTALLATIONS_SETTINGS = "https://github.com/settings/installations";

const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
// Documents select `__typename` on organisation nodes so a path can be traced to one.
const TYPENAME = "__typename";

function issue(reason: OrgAccessIssue["reason"], org: string | null): GitHubError {
  const fixUrl =
    reason === "sso"
      ? org === null
        ? TOKENS_SETTINGS
        : `https://github.com/orgs/${org}/sso`
      : reason === "fineGrainedPolicy"
        ? FINE_GRAINED_SETTINGS
        : INSTALLATIONS_SETTINGS;
  return { kind: "orgAccess", issue: { org, reason, fixUrl } };
}

/** "The `acme` organization forbids access via …" names the organisation. */
function orgInMessage(message: string): string | null {
  const login = /([A-Za-z0-9-]{1,39})[`'"]? organization forbids/i.exec(message)?.[1];
  return login ?? null;
}

/**
 * Maps a message GitHub sends for an organisation it will not show this token. null when
 * the message is not one of those.
 */
function orgAccessFromMessage(message: string, org: string | null): GitHubError | null {
  if (SAML.test(message)) return issue("sso", org);
  if (FINE_GRAINED_POLICY.test(message))
    return issue("fineGrainedPolicy", org ?? orgInMessage(message));
  if (NOT_ACCESSIBLE_BY_APP.test(message)) return issue("appNotInstalled", org);
  // Missing permission, or an organisation that has not approved this fine-grained
  // token: GitHub words both the same, and the user fixes both on the token's page.
  if (org !== null && NOT_ACCESSIBLE_BY_PAT.test(message)) return issue("fineGrainedPolicy", org);
  return null;
}

function secondsHeader(headers: Headers, name: string): number | null {
  const text = headers.get(name);
  return text !== null && /^\d+$/.test(text) ? Number(text) : null;
}

/** GitHub's guidance: without `retry-after`, wait at least a minute. */
function secondaryLimit(headers: Headers, now: Date): GitHubError {
  const seconds = secondsHeader(headers, "retry-after") ?? 60;
  return { kind: "secondaryLimit", retryAt: new Date(now.getTime() + seconds * 1000) };
}

function primaryLimit(headers: Headers, now: Date): GitHubError {
  const reset = secondsHeader(headers, "x-ratelimit-reset");
  return { kind: "rateLimited", resetAt: reset === null ? now : new Date(reset * 1000) };
}

/** `X-GitHub-SSO: required; url=https://github.com/orgs/acme/sso?authorization_request=…` */
function ssoFromHeader(value: string): GitHubError {
  const url = /url=(\S+)/.exec(value)?.[1];
  if (url === undefined || !url.startsWith("https://github.com/")) return issue("sso", null);
  const org = /^https:\/\/github\.com\/orgs\/([^/?#]+)\//.exec(url)?.[1];
  return {
    kind: "orgAccess",
    issue: { org: org !== undefined && LOGIN.test(org) ? org : null, reason: "sso", fixUrl: url },
  };
}

/** A non-2xx response. `message` is GitHub's `message` field, when the body had one. */
export function errorFromResponse(
  response: Response,
  message: string | undefined,
  now: Date,
): GitHubError {
  const { status, headers } = response;
  if (status === 401) return { kind: "unauthorized" };
  if (status === 404) return { kind: "notFound" };
  if (status === 403 || status === 429) {
    const sso = headers.get("x-github-sso");
    if (status === 403 && sso !== null && sso.startsWith("required")) return ssoFromHeader(sso);
    // Order from GitHub's docs: retry-after first, then an exhausted primary limit.
    if (headers.has("retry-after")) return secondaryLimit(headers, now);
    if (headers.get("x-ratelimit-remaining") === "0") return primaryLimit(headers, now);
    if (status === 429 || SECONDARY.test(message ?? "")) return secondaryLimit(headers, now);
    const orgAccess = orgAccessFromMessage(message ?? "", null);
    if (orgAccess !== null) return orgAccess;
    return { kind: "forbidden", detail: redact(message ?? `GitHub answered ${status}.`) };
  }
  // ponytail: 5xx and unexpected 4xx are "the request failed" to the user; split out a
  // server-error kind if the UI ever needs to word them differently.
  return { kind: "network" };
}

/** The organisation an error path points into: the deepest `Organization` node on it. */
function orgOnPath(data: unknown, path: readonly (string | number)[]): string | null {
  let node: unknown = data;
  let org: string | null = null;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) break;
    const login: unknown = Reflect.get(node, "login");
    if (Reflect.get(node, TYPENAME) === "Organization" && typeof login === "string") {
      org = LOGIN.test(login) ? login : org;
    }
    node = Reflect.get(node, segment);
  }
  return org;
}

/** One entry of a GraphQL `errors` array. `data` is the (partial) data beside it. */
export function errorFromGraphQL(
  entry: GraphQLErrorEntry,
  context: { readonly data: unknown; readonly headers: Headers; readonly now: Date },
): GitHubError {
  const { type, message } = entry;
  if (type === "RATE_LIMITED") return primaryLimit(context.headers, context.now);
  if (type === "NOT_FOUND") return { kind: "notFound" };
  if (type === undefined || type === "FORBIDDEN") {
    const org = entry.path === undefined ? null : orgOnPath(context.data, entry.path);
    const orgAccess = orgAccessFromMessage(message, org);
    if (orgAccess !== null) return orgAccess;
  }
  if (type === "FORBIDDEN" || type === "INSUFFICIENT_SCOPES") {
    return { kind: "forbidden", detail: redact(message) };
  }
  // Anything else (MAX_NODE_LIMIT_EXCEEDED, a parse error, …) means our document is wrong.
  return {
    kind: "schema",
    detail: redact(`GraphQL error ${type ?? "without a type"}: ${message}`),
  };
}
