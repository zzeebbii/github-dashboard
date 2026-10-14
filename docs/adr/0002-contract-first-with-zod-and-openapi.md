# ADR-0002: Zod contracts as source of truth, OpenAPI as the artifact

**Status:** Superseded by [ADR-0014](0014-spa-only-browser-direct-github-access.md)
**Date:** 2026-08-15

## Context

We need a typed frontend/backend boundary where incompatible changes fail CI, without
coupling the frontend to a TypeScript backend implementation.

Four approaches were on the table: shared TypeScript types, spec-first OpenAPI, typed
RPC (tRPC/oRPC), and code-first schemas that emit a spec.

## Decision

`packages/contracts` holds Zod 4 schemas plus framework-neutral endpoint descriptors.
Both apps import it. A generator emits `artifacts/openapi.json`, which is **committed**
and treated as the contract of record.

```
packages/contracts (Zod) ──┬── apps/api validates requests/responses
                           ├── apps/web types the client + validates responses
                           └── artifacts/openapi.json (committed, language-neutral)
```

CI regenerates the spec and fails on drift, then classifies changes as additive or
breaking against the base branch.

Endpoint descriptors are deliberately **not** `@hono/zod-openapi`'s `createRoute`:
importing a framework into the contract would couple it to a TypeScript backend.

## Consequences

- One source of truth in TypeScript. No YAML authoring, no codegen in the inner loop.
- The committed spec means a .NET or Go backend never needs the Zod package — it
  implements the spec and serves the same document.
- Runtime validation on both sides complements compile-time types, which vanish.
- Cost: discipline is required to keep `contracts` schema-only. Enforced mechanically.
- Cost: the frontend imports the same package as the backend, so a careless addition
  there could couple them. The zod-only lint rule is what prevents this.

## Alternatives considered

| Option                                    | Why not                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Spec-first YAML                           | Best language neutrality, worst DX: hand-authored YAML plus generated code agents must not edit.                      |
| tRPC                                      | Excellent DX, but TypeScript-only by construction. Directly violates backend replaceability.                          |
| oRPC                                      | Emits OpenAPI, but the ergonomic path couples the frontend to backend router _types_ — the exact prohibited coupling. |
| Frontend consumes only a generated client | Strongest isolation, but pure ergonomic cost. Reconsider if convenience coupling appears in practice.                 |

## Revisit when

Convenience coupling appears in `packages/contracts`, or a non-TypeScript backend is
actually built — at which point verify the spec really is sufficient.
