# ADR-0013: Adopt TypeScript 7, with a private TypeScript 6 for dependency-cruiser

**Status:** Accepted
**Date:** 2026-08-15

## Context

TypeScript 7.0 (the Go-native compiler) went GA on 8 July 2026, roughly 10x faster at
type-checking. It was six weeks old when this repository was created.

Its known limitation is significant: **TS7 does not expose a stable programmatic
compiler API until 7.1.** Every tool that consumes the compiler as a library is
affected — typescript-eslint, Vue/Svelte/Astro template checking, and, as we found,
dependency-cruiser.

## Decision

Adopt TypeScript 7.0.2 for the whole repository.

A compatibility spike was run **before** committing to the stack. Verified working
under TS7: `tsc`, Vite 8, Vitest 4, drizzle-kit, `@hono/zod-openapi`, and oxlint's
type-aware mode via tsgolint (which runs on typescript-go directly rather than through
the compiler API, which is precisely why it works).

**dependency-cruiser 18 does not support TS7.** Left alone it does not error — it
cruises **zero modules and reports success**, which is worse than failing. It is given
its own private TypeScript 6 via pnpm `packageExtensions`, used only for parsing.
pnpm's isolated `node_modules` keeps that copy invisible to every other package; the
repository still compiles with TS7.

## Consequences

- Type-checking is dramatically faster, which matters for a gate agents run constantly.
- OXC becomes load-bearing rather than merely preferred (ADR-0007).
- Cost: a second TypeScript in the dependency tree, for one tool, for parsing only.
- Cost: adopting a six-week-old compiler carries residual risk. The fallback is
  documented: pin the affected package to TypeScript 6; nothing else in the design
  depends on TS7.

## The lesson worth keeping

A guardrail that reports success while checking nothing is worse than no guardrail. The
dependency-cruiser failure was invisible until someone checked the module count. This is
why Phase 9 of the build deliberately breaks each rule to confirm it actually fires.

## Revisit when

- TypeScript 7.1 ships a stable compiler API → drop the private TS6 and re-evaluate.
- dependency-cruiser announces TS7 support → remove the `packageExtensions` entry.
