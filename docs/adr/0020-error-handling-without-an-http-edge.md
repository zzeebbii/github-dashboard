# ADR-0020: Error handling without an HTTP edge

**Status:** Accepted
**Date:** 2026-10-13

Amends [ADR-0009](0009-rfc9457-error-handling.md).

## Context

ADR-0009 put RFC 9457 `problem+json` at our own HTTP edge and `Result` types in the
core. The HTTP edge is gone ([ADR-0014](0014-spa-only-browser-direct-github-access.md)).
Errors now come from GitHub (REST status codes, GraphQL `errors` arrays, rate limits,
SSO enforcement) and from the browser (offline, storage failures).

## Decision

- **Keep:** `Result<T, E>` with discriminated-union errors in `domain/`, and
  exceptions only for genuinely exceptional conditions.
- **Drop:** the `problem+json` shape and its mapping layer.
- **GitHub errors** are mapped once, in `infrastructure/github/`, to a transport-
  agnostic `GitHubError` union: `unauthorized`, `forbidden`, `orgAccess` (with org,
  reason and fix URL), `rateLimited`, `secondaryLimit`, `network`, `schema`,
  `notFound`. The UI renders from the union, never from status codes.
- **Partial GraphQL results** are kept: successful parts render; failed repositories
  are flagged in place.
- **Every error message is redacted**: no token, header or URL with credentials ever
  reaches a message, log or UI string ([ADR-0016](0016-auth-port-and-token-storage.md)).
- Offline and storage failures fall back to cached data with a visible banner, never
  a blank screen.

## Consequences

- One error vocabulary for the whole UI; tests assert on union members.
- A GitHub API change is absorbed in one mapping file.
- Cost: GitHub's error text (SSO, fine-grained approval) has to be pattern-matched;
  the mapping prefers GraphQL error `type` and falls back to message text.

## Alternatives considered

| Option                           | Why not                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| Keep problem+json internally     | No HTTP edge to apply it to; it would be a shape with no producer. |
| Throw raw fetch errors to the UI | Leaks transport details and makes status handling scattered.       |

## Revisit when

A server-side component that serves our own HTTP API returns
([ADR-0014](0014-spa-only-browser-direct-github-access.md) revisit).
