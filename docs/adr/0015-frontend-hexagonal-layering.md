# ADR-0015: Frontend hexagonal layering

**Status:** Accepted
**Date:** 2026-10-13

Amends [ADR-0005](0005-machine-enforced-architecture.md).

## Context

With the API gone ([ADR-0014](0014-spa-only-browser-direct-github-access.md)), all
architecture rules apply to `apps/web`. The browser now holds a GitHub token, so
where network and storage access happen is a security boundary, not only a style
rule. The template's web layers already exist; this records how they apply to a
browser-only GitHub client.

## Decision

`apps/web/src` is layered, and dependencies point inward:

```
domain/          pure PR logic: section rules, re-review, activity, staleness, sort keys.
                 No Zod, React, TanStack or browser APIs. Plain types, branded ids.
application/     ports (AuthPort, GitHubReadPort, CachePort, AccountStore,
                 PreferencesStore, CrossTabPort) and TanStack Query hooks.
                 Imports domain only. Never imports infrastructure.
infrastructure/  adapters: GitHub GraphQL/REST client, auth (PAT, GitHub App),
                 IndexedDB cache, Web Storage, Web Locks + BroadcastChannel.
                 The ONLY layer that calls fetch or touches browser storage.
ui/              presentational components. Props in, JSX out. No data fetching.
features/        composes application hooks with ui components.
config/env.ts    the only reader of import.meta.env.
```

- **Zod guards the GitHub boundary.** Every GitHub response is parsed by a Zod
  schema in `infrastructure/github/` and mapped to domain types. A parse failure is
  a typed `schema` error, never a crash.
- **GraphQL documents are static** with typed variables. User input is never
  concatenated into a query.
- Enforcement keeps ADR-0005's four mechanisms. dependency-cruiser and oxlint rules
  are rewritten for these layers, and oxlint bans `fetch`, `XMLHttpRequest`,
  `localStorage`, `sessionStorage`, `indexedDB`, `BroadcastChannel` and
  `navigator.locks` outside `infrastructure/`, and raw-HTML APIs outside the one
  sanitising component. `scripts/verify-guardrails.mjs` proves each rule fires.

## Consequences

- Components and hooks are tested against in-memory port fakes, with no network.
- A token can only be read or sent by code in one directory, which is where review
  attention goes.
- Cost: every new browser capability needs a port and an adapter, even when a direct
  call would be shorter.

## Alternatives considered

| Option                                   | Why not                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Call GitHub from hooks directly          | Spreads token handling everywhere and makes components untestable offline.     |
| Generated GitHub SDK (Octokit) as a port | Large dependency surface in the browser; validation still needed on top.       |
| Zod in domain                            | Couples the core to a library; the pure-domain rule from ADR-0004 still holds. |

## Revisit when

The adapter layer grows a second consumer (a browser extension, a CLI) that would
benefit from a shared, published GitHub client package.
