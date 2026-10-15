# Testing

The strategy optimises for **confidence per test**, not test count. A suite that is
green while the application is broken is worse than no suite, because it is trusted.
The decisions are in [ADR-0019](../adr/0019-testing-a-browser-only-app.md).

## The default is: do not mock

| What you are testing           | How                                                   | Where                       |
| ------------------------------ | ----------------------------------------------------- | --------------------------- |
| Domain rules                   | No mocks, no I/O; "now" passed in                     | `apps/web/src/**/*.test.ts` |
| Hooks and use of ports         | In-memory port fakes                                  | `apps/web/src/**/*.test.ts` |
| GitHub adapter                 | MSW in Node serving recorded fixtures                 | `apps/web/tests/fixtures/`  |
| IndexedDB / cross-tab adapters | Real browser APIs in Vitest browser mode              | `apps/web/tests/`           |
| React components               | Real Chromium, in-memory ports, axe                   | `apps/web/tests/component/` |
| User journeys                  | Playwright vs the prod-like stack, `page.route` mocks | `e2e/tests/`                |

Today only the domain unit tests, the Home component test and the E2E smoke test
exist. MSW, the fixtures and axe arrive with the features that need them.

`vi.mock` of an internal module is **banned**. If you want it, you are missing a port —
add the port. That is an architecture signal, not a testing inconvenience.

## Why real dependencies

**Real browser, not jsdom, for components and storage.** jsdom passes on focus,
layout, `dialog` and IndexedDB behaviour that real browsers reject. jsdom is kept only
for pure logic (the `unit` Vitest project), where a browser is wasted overhead.

**Recorded GitHub fixtures, not live GitHub.** Live calls need a token in CI and are
slow, rate-limited and non-deterministic. Fixtures include headers and contain no real
tokens. Re-record them when GitHub's responses change.

**E2E does not change the production build.** GitHub is mocked with Playwright's
`page.route`, so the shipped CSP is the one under test. A journey fails on any CSP
violation or request to an origin that is not allowed.

## Quota budget tests

The MSW harness counts requests and sums GraphQL `cost`. Each query asserts its budget
from [ADR-0017](../adr/0017-indexeddb-cache-and-quota-budget.md), for example "Home
refresh: at most 3 GraphQL queries, at most 50 points". A budget regression fails CI
like any other bug.

## Accessibility and i18n

- axe runs in every component test and every E2E step, in light and dark themes.
- `pnpm i18n:check` (arrives with the message catalogues) fails when Finnish or Swedish
  lacks a key English has.

## Determinism

Time and randomness are passed in, never ambient. Domain functions take `now` as an
argument; `apps/web/tests/determinism.ts` has fixed and advanceable clocks for code
that takes a clock. No test freezes global timers.

## Coverage

Per layer, not one global number — a single figure is trivially gamed by testing easy
code. Thresholds live in `apps/web/vite.config.ts`: 85% lines for `ui/`, 80% for
`features/`, `application/` and `infrastructure/`.

## Running things

```bash
pnpm test:unit          # fast; run constantly
pnpm test:component     # real browser
pnpm stack:prod-like    # then, in another shell:
pnpm test:e2e
```

## Writing a good test here

- Assert on **behaviour a user can observe**, not on internals.
- In component tests use accessible names (`getByRole('heading', { name: 'GitHub Dashboard' })`).
  They describe what a user perceives, and they break when the UI genuinely breaks.
- Validate fixtures against the adapter's Zod schemas, so a fixture cannot drift from
  what the adapter accepts.
- One reason to fail per test. If the name needs "and", split it.
