# ADR-0014: SPA only, browser-direct GitHub access

**Status:** Accepted
**Date:** 2026-10-13

Supersedes [ADR-0002](0002-contract-first-with-zod-and-openapi.md),
[ADR-0004](0004-hono-hexagonal-backend.md) and
[ADR-0006](0006-drizzle-behind-repository-ports.md). Amends
[ADR-0001](0001-monorepo-with-extractable-contracts.md) and
[ADR-0012](0012-conventional-commits-and-breaking-changes.md).

## Context

This repository started as a full-stack template: a React SPA, a Hono API on
PostgreSQL, and a Zod contract package shared between them. It is now a personal,
read-only GitHub pull-request dashboard.

Every piece of data the dashboard shows lives in GitHub. GitHub's REST and GraphQL
APIs allow cross-origin requests with an `Authorization` header, so a browser can
call them directly. A server of our own would add hosting, a database and a
contract, and its only job would be to forward requests GitHub already serves.

The one task a browser cannot do is the GitHub App code-for-token exchange: it needs
the client secret, and GitHub's token endpoint does not allow cross-origin calls.
That is a stateless forward, not an application backend ([ADR-0016](0016-auth-port-and-token-storage.md)).

## Decision

The product is a single-page app in `apps/web` that calls `https://api.github.com`
directly with the signed-in account's token and caches results in the browser
([ADR-0017](0017-indexeddb-cache-and-quota-budget.md)).

- `apps/api`, `packages/contracts` and `artifacts/openapi.json` are removed.
- No database of our own. All state is in the browser.
- GitHub's own schemas are the external contract. Responses are validated with Zod
  inside the GitHub adapter ([ADR-0015](0015-frontend-hexagonal-layering.md)).
- The only server-side code ever planned is a stateless GitHub App token-exchange
  and refresh handler, added when GitHub App sign-in is enabled.
- The pnpm workspace stays ([ADR-0001](0001-monorepo-with-extractable-contracts.md)):
  `apps/web` and `e2e` remain workspace packages. The contracts-package rationale
  no longer applies.
- Conventional Commits and the changelog stay
  ([ADR-0012](0012-conventional-commits-and-breaking-changes.md)). The OpenAPI
  breaking-change interlock is removed with the OpenAPI file.

## Consequences

- One deployable: a static build any host can serve ([ADR-0018](0018-static-host-agnostic-deployment.md)).
- No server to run, patch or pay for, and no database migrations.
- The token lives in the browser. That makes XSS the main threat, which the CSP,
  the lint rules and the HTML sanitiser address ([ADR-0016](0016-auth-port-and-token-storage.md)).
- Rate limits are per account and are spent by the browser, so request efficiency
  is an architectural concern, not a tuning detail ([ADR-0017](0017-indexeddb-cache-and-quota-budget.md)).
- Cost: no shared cache across devices or users. Each browser fetches its own data.
- Cost: the "replace the backend with .NET/Go/Java" goal of the template is gone.

## Alternatives considered

| Option                                 | Why not                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Keep the Hono API as a GitHub proxy    | Adds hosting, a contract and a second test surface to forward requests GitHub already serves. |
| Backend that stores data in PostgreSQL | Duplicates GitHub's data, needs sync logic, and the dashboard has no data of its own.         |
| Serverless proxy for every request     | Same cost as a backend for no gain; only the token exchange actually needs a server.          |

## Revisit when

The dashboard needs data GitHub does not provide (shared team views, history beyond
GitHub's API, notifications), or GitHub stops allowing cross-origin API calls.
