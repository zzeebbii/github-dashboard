import type { z } from "zod";
import type { AuthPort } from "../../application/auth.ts";
import type { CachePort } from "../../application/cache.ts";
import type { GitHubError, GitHubResult } from "../../application/github.ts";
import type { AccountId } from "../../domain/account.ts";
import { errorFromGraphQL, errorFromResponse } from "./errors.ts";
import type { RateLimitTracker } from "./rate-limit.ts";
import { GraphQLEnvelopeSchema, RateLimitFieldSchema, RestErrorSchema } from "./schemas/graphql.ts";

const API_ORIGIN = "https://api.github.com";
const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

/**
 * A static GraphQL document (FR-3.14): the query is a constant string, never built from
 * input, and `TVariables` types what may be passed to it. Every document selects
 * `rateLimit { cost limit remaining resetAt }`.
 */
export interface GraphQLDocument<TVariables extends Record<string, unknown>, TData> {
  readonly query: string;
  /** Validates `data`. Fields a partial error can null out must be nullable. */
  readonly schema: z.ZodType<TData>;
  /** Type-only: ties the variables type to the document. Never set. */
  readonly variables?: TVariables;
}

export interface GitHubClientOptions {
  readonly auth: AuthPort;
  readonly tracker: RateLimitTracker;
  /** REST ETags and bodies, in the `requests` store (FR-3.3). */
  readonly cache: CachePort;
  readonly clock: { now(): Date };
  /** Called on a 401 or a missing token; signs out only that account (T10). */
  readonly onUnauthorized: (accountId: AccountId) => void;
  /** Injected so tests can count requests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export interface GitHubClient {
  graphql<TVariables extends Record<string, unknown>, TData>(
    accountId: AccountId,
    document: GraphQLDocument<TVariables, TData>,
    variables: TVariables,
  ): Promise<GitHubResult<TData>>;
  /** GET `path` (e.g. `/repos/o/r/pulls/1/files`) with the stored ETag. */
  rest<TData>(
    accountId: AccountId,
    path: string,
    schema: z.ZodType<TData>,
  ): Promise<GitHubResult<TData>>;
}

const fail = (error: GitHubError) => ({ ok: false, error }) as const;
const succeed = <T>(data: T, partialErrors: readonly GitHubError[] = []) =>
  ({ ok: true, value: { data, partialErrors } }) as const;

/** Names failing fields and checks, never values: a response could echo anything. */
function schemaError(error: z.ZodError): GitHubError {
  const first = error.issues[0];
  const where = first === undefined ? "" : `${first.path.join(".") || "(root)"}: ${first.code}`;
  return { kind: "schema", detail: `GitHub returned an unexpected response (${where}).` };
}

/**
 * The only GitHub transport (FR-3.1–3.4). Attaches the account's token, records rate-limit
 * state from every response, validates every body, and maps every failure to a
 * `GitHubError`. The token goes only to api.github.com and never into a result.
 */
export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const { auth, tracker, cache, clock, onUnauthorized } = options;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function send(
    accountId: AccountId,
    url: string,
    init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
  ): Promise<Response | GitHubError> {
    const token = await auth.currentToken(accountId);
    if (token === null) {
      onUnauthorized(accountId);
      return { kind: "unauthorized" };
    }
    let response: Response;
    try {
      response = await doFetch(url, {
        method: init.method,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(init.body === undefined ? {} : { body: init.body }),
        credentials: "omit",
        // We send If-None-Match ourselves; the browser must hand us GitHub's 304 as is.
        cache: "no-store",
      });
    } catch {
      // The underlying error is dropped on purpose: its text is not ours to vouch for.
      return { kind: "network" };
    }
    tracker.fromHeaders(accountId, response.headers);
    if (response.status === 401) onUnauthorized(accountId);
    return response;
  }

  async function failure(response: Response): Promise<GitHubError> {
    const body = RestErrorSchema.safeParse(await response.json().catch(() => null));
    return errorFromResponse(response, body.success ? body.data.message : undefined, clock.now());
  }

  return {
    async graphql(accountId, document, variables) {
      const response = await send(accountId, GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: document.query, variables }),
      });
      if ("kind" in response) return fail(response);
      if (!response.ok) return fail(await failure(response));

      const envelope = GraphQLEnvelopeSchema.safeParse(await response.json().catch(() => null));
      if (!envelope.success) return fail(schemaError(envelope.error));
      const { data, errors = [] } = envelope.data;

      const rateLimit = RateLimitFieldSchema.safeParse(data);
      if (rateLimit.success) tracker.fromGraphQL(accountId, rateLimit.data.rateLimit);

      const context = { data, headers: response.headers, now: clock.now() };
      const mapped = errors.map((entry) => errorFromGraphQL(entry, context));
      if (data === null || data === undefined) {
        return fail(
          mapped[0] ?? { kind: "schema", detail: "GitHub returned neither data nor errors." },
        );
      }
      const parsed = document.schema.safeParse(data);
      return parsed.success ? succeed(parsed.data, mapped) : fail(schemaError(parsed.error));
    },

    async rest(accountId, path, schema) {
      const url = new URL(path, API_ORIGIN);
      // The token goes to api.github.com only: refuse "//evil.example" and absolute URLs.
      if (!path.startsWith("/") || path.startsWith("//") || url.origin !== API_ORIGIN) {
        throw new Error("GitHub REST paths must be relative to api.github.com.");
      }
      const cached = await cache.get(accountId, "requests", path);
      const response = await send(accountId, url.href, {
        method: "GET",
        ...(cached?.etag === undefined ? {} : { headers: { "If-None-Match": cached.etag } }),
      });
      if ("kind" in response) return fail(response);

      if (response.status === 304) {
        // Stored data is validated on read, like any other boundary.
        const reused = schema.safeParse(cached?.data);
        return reused.success ? succeed(reused.data) : fail(schemaError(reused.error));
      }
      if (!response.ok) return fail(await failure(response));

      const parsed = schema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) return fail(schemaError(parsed.error));
      const etag = response.headers.get("etag");
      await cache.put(accountId, "requests", path, {
        data: parsed.data,
        ...(etag === null ? {} : { etag }),
      });
      return succeed(parsed.data);
    },
  };
}
