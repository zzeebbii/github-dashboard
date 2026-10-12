# ADR-0001: pnpm monorepo with an extractable contracts package

**Status:** Accepted
**Date:** 2026-08-15

## Context

The repository must satisfy two goals that pull in opposite directions: the frontend
and backend should be strongly typed against one another, and the backend must remain
replaceable by .NET, Java, Go, or a managed platform.

A monorepo makes the typed boundary ergonomic (atomic changes, one CI pipeline, one
clone for an agent). Separate repositories make independence obvious but make every
contract change a two-PR dance with version skew in between.

## Decision

A single pnpm workspace containing `apps/api`, `apps/web`, `packages/contracts`,
`packages/testing`, and `e2e`.

Independence is achieved **structurally rather than by separation**:

- `packages/contracts` depends on nothing but Zod and is independently publishable.
- `dependency-cruiser` forbids `apps/web → apps/api` and the reverse.
- `artifacts/openapi.json` is committed and is the language-neutral contract of record.

pnpm specifically (not npm or yarn) because its strict, non-flat `node_modules` makes
phantom dependencies impossible — a package cannot import something it did not declare.

## Consequences

- Contract and consumers change in one commit; no version skew window.
- One `pnpm verify` covers everything, which is decisive for agent workflows.
- The monorepo creates constant temptation toward convenience coupling. That is why
  the boundary rules are hard CI gates rather than guidance (see ADR-0005).
- Extracting the contract later is `pnpm publish`, not a refactor.

## Alternatives considered

| Option                        | Why not                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two repositories              | Real independence, but contract changes need coordinated releases and a compatibility window. Much worse for agents: two clones, two pipelines, no atomic change. |
| Polyrepo + published contract | The end state if the API gains third-party consumers. Premature now — publishing overhead with a single first-party consumer.                                     |

## Revisit when

A second independent consumer of the API appears (a mobile client, another team), or
the backend is genuinely rewritten in another language. At that point publish
`@kit/contracts` and consume it by version.
