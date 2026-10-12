# ADR-0003: Framework-light React, no meta-framework, code-based routes

**Status:** Accepted
**Date:** 2026-08-15

## Context

React applications typically reach for Next.js, Remix, or TanStack Start. Each assumes
it owns a server.

## Decision

React 19 as a SPA, built by Vite 8, routed by TanStack Router using **code-based**
routes, with TanStack Query for server state. No meta-framework.

## Consequences

- The frontend is a pure client of an HTTP contract, so the backend is genuinely
  replaceable. Next.js server actions or RSC would silently re-couple us to a
  TypeScript server.
- No server/client boundary to reason about — a common source of agent errors.
- Code-based routes avoid a generated `routeTree.gen.ts` that must exist before
  typecheck, removing an ordering constraint from every build and CI run, and removing
  a generated file agents must never hand-edit.
- Cost: no SSR or SEO out of the box. For an authenticated application this is usually
  irrelevant; for a public marketing surface it is not.

## Alternatives considered

| Option                     | Why not                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Next.js                    | Assumes it owns the server; RSC/server actions re-couple frontend to a TS backend.       |
| TanStack Start             | Same replaceability concern, less mature.                                                |
| File-based TanStack routes | Requires codegen before typecheck; adds build ordering and a do-not-edit generated file. |

## Revisit when

SSR or SEO becomes a real requirement. The migration path is Vite SSR or TanStack
Start; because data access is behind a port, the change is confined to routing and
entry points.
