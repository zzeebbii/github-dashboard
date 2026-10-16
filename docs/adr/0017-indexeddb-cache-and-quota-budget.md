# ADR-0017: IndexedDB cache and quota budget

**Status:** Accepted
**Date:** 2026-10-13

## Context

GitHub allows about 5,000 REST requests and 5,000 GraphQL points per hour per
token. A dashboard that polls every repository and pull request exhausts that
quickly. The browser spends the quota directly ([ADR-0014](0014-spa-only-browser-direct-github-access.md)),
so "make few calls without losing data" needs a measurable target and a cache.

## Decision

**Cache.** A `CachePort` over IndexedDB with a schema version. A version mismatch or
a corrupt record drops and rebuilds the database without an error. Records are keyed
by account id. TanStack Query is hydrated from the cache before data views render,
then refreshed in the background (cache-first).

**Requests.**

- List data comes from batched GraphQL queries. The app never makes one request per
  PR for list data.
- REST requests send `If-None-Match` with the stored ETag; a 304 reuses the cached body.
- Queries run one after another per account.

**Refresh.** Every 5 minutes while the tab is visible; on focus when the last refresh
is over 60 seconds old; paused while hidden; manual refresh always available. Only one
tab refreshes: the leader holds a Web Lock and publishes changes on a
`BroadcastChannel`; other tabs follow.

**Quota guard.** Below 20% of the GraphQL pool remaining, the interval doubles. Below
5%, auto-refresh stops until the reset. A secondary limit (403/429 with `retry-after`)
pauses that account's requests until `retry-after` elapses.

**Budget** (asserted by tests against recorded GitHub fixtures, counting requests and
summed GraphQL `cost`):

| Operation                        | Budget                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home refresh                     | 1 GraphQL search per section per 20 results (3 when each section has ≤ 20 PRs, ≤ 5 for 60), 1 point each; plus ≤ ⌈k/10⌉ one-point "new activity" queries for the k rows with activity since their seen marker |
| Favourites refresh               | 1 GraphQL query per 25 favourites                                                                                                                                                                             |
| Opening a PR                     | at most 2 GraphQL queries, 0 REST; 0 when served from cache                                                                                                                                                   |
| Steady state (5-minute interval) | under 1,000 GraphQL points per hour                                                                                                                                                                           |

**Amended 2026-10-16 (measured).** GitHub stops a GraphQL request after 10 s, and time per
request, not points, is the real limit for PR lists. `PullRequest.mergeStateStatus` costs about
0.3 s per PR and is the only field that makes full rows time out, so **no list query requests it**:
conflicts come from `mergeable`, CI from `PullRequest.statusCheckRollup`. List queries page at
**20 PRs** (about 4 s, 1 point). Measurements and the list-query design are in
[docs/architecture/github-query-costs.md](../architecture/github-query-costs.md).

## Consequences

- The dashboard opens instantly from cache and stays within about 20% of the quota.
- A budget regression fails CI like any other bug.
- Cost: data can be up to 5 minutes old; the header shows when it last refreshed.
- Cost: fixtures must be re-recorded when GitHub's schema or point costs change.

## Alternatives considered

| Option                          | Why not                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| localStorage cache              | Size-limited and synchronous; PR detail data does not fit.                                 |
| No persistent cache             | Every reload spends quota and shows a spinner.                                             |
| GitHub webhooks for freshness   | Need a server to receive them (ADR-0014).                                                  |
| A TanStack persister dependency | A small hydration module over the existing `CachePort` covers it without a new dependency. |

## Revisit when

GitHub changes its rate-limit model or point costs, or the budget tests start
needing frequent re-tuning.
