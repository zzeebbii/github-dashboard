# ADR-0004: Hono on Node 24 with hexagonal architecture

**Status:** Superseded by [ADR-0014](0014-spa-only-browser-direct-github-access.md)
**Date:** 2026-08-15

## Context

The backend must be TypeScript but must not tie the application to a specific HTTP
framework, ORM, or runtime.

## Decision

Hono 4 on Node 24 LTS, with strict ports-and-adapters layering:

```
domain/          pure. zero imports.
application/     use cases + port interfaces. imports domain only.
infrastructure/  adapters implementing ports.
http/            Hono routes + the single composition root.
```

Dependency injection is **explicit constructor wiring in `http/composition.ts`** — no
container, no decorators.

## Consequences

- Hono's Web-Standard `Request`/`Response` means the runtime is replaceable (Node →
  Bun → Deno → Workers → Lambda) without touching application code.
- The framework is confined to `http/`, so replacing Hono touches one directory.
- Explicit wiring is greppable and impossible to get "magically" wrong — an agent can
  read `composition.ts` top to bottom and know exactly what the app is built from.
- Cost: more files per feature than a transaction-script style. Genuine overkill for a
  pure CRUD app; the point is to scale past CRUD.
- Cost: thinner ecosystem than Fastify — DI, logging, and metrics are hand-wired.

## Alternatives considered

| Option      | Why not                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS      | Batteries-included and agent-legible, but decorator/DI metadata couples domain classes to the framework and contradicts "explicit and boring over clever". Hardest to decouple later. |
| Fastify     | More mature Node ecosystem, but Node-coupled and a clunkier Zod type-provider story.                                                                                                  |
| Hono on Bun | Faster startup, less mature CI/Docker ecosystem. Hono makes this a later, cheap switch.                                                                                               |

## Revisit when

The application needs a capability Hono's ecosystem lacks. Because the framework lives
only in `http/`, this is a contained change.
