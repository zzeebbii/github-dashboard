# ADR-0019: Testing a browser-only app

**Status:** Accepted
**Date:** 2026-10-13

Amends [ADR-0008](0008-testing-strategy.md).

## Context

ADR-0008's principle holds: test at real boundaries and do not mock by default. Its
table assumed a PostgreSQL repository layer and an HTTP API of our own, both removed
by [ADR-0014](0014-spa-only-browser-direct-github-access.md). The new boundaries are
GitHub's APIs and browser storage.

## Decision

| Layer                          | Approach                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| domain, application            | No mocks, no I/O. In-memory port fakes; injected clock.                        |
| GitHub adapter                 | MSW in Node serving **recorded** GitHub fixtures (headers included).           |
| IndexedDB / cross-tab adapters | Real browser APIs in Vitest browser mode.                                      |
| Components                     | Real Chromium, in-memory ports, **axe** on every component in both themes.     |
| Journeys                       | Playwright against the nginx prod-like stack, GitHub mocked with `page.route`. |

- **Quota budget tests** use the MSW harness to count requests and sum GraphQL
  `cost`, and assert the budgets in [ADR-0017](0017-indexeddb-cache-and-quota-budget.md).
- **E2E does not change the production build.** GitHub is mocked by Playwright request
  interception, so the production CSP stays exactly as shipped. Journeys fail on any
  CSP violation or request to a non-allow-listed origin.
- **i18n:** `pnpm i18n:check` fails when Finnish or Swedish lacks a key English has
  ([ADR-0021](0021-i18n-themes-and-accessibility.md)).
- Fixtures live in `apps/web/tests/fixtures/` and contain no real tokens.
- `vi.mock` of internal modules stays banned. Coverage thresholds stay per layer.

## Consequences

- No Docker daemon is needed for unit, component or adapter tests.
- Budget regressions and accessibility regressions fail CI.
- Cost: fixtures must be re-recorded when GitHub's responses change.
- Cost: Testcontainers integration tests are gone with the database.

## Alternatives considered

| Option                    | Why not                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| Hit live GitHub in CI     | Needs a token in CI, is slow, rate-limited and non-deterministic.     |
| MSW service worker in E2E | Requires loosening the production CSP or a separate test build.       |
| jsdom for IndexedDB       | Passes on behaviour that real browsers reject (ADR-0008's own point). |

## Revisit when

Recorded fixtures drift from live GitHub often enough to hide real failures; then add
a scheduled, token-backed contract check against live GitHub.
