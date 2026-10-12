# ADR-0009: RFC 9457 problem details at the edge, Result types in the core

**Status:** Accepted
**Date:** 2026-08-15

## Context

Without one stated convention, error handling grows three incompatible styles in the
same codebase — and agents will invent a fourth.

## Decision

- **HTTP edge:** RFC 9457 `application/problem+json`. One shape for every error,
  defined once in `packages/contracts`.
- **Domain:** `Result<T, E>` with discriminated-union error types. Expected failures
  are values, not exceptions.
- **Application:** a transport-agnostic `AppError` vocabulary that never mentions
  status codes. Mapping to HTTP happens only in `http/problem.ts`.
- Exceptions are reserved for genuinely exceptional conditions and are caught by a
  single handler that logs the cause and returns a body leaking nothing.

## Consequences

- Use cases have no idea what a 404 is, so swapping HTTP for a queue or gRPC replaces
  one file.
- Expected failures are visible in type signatures; a caller cannot forget to handle
  one because the compiler makes them unwrap the `Result`.
- Exhaustive `switch` over error kinds means adding a new failure mode without handling
  it is a compile error.
- Cost: more verbose than throwing. That verbosity is the point — it is what makes
  failure paths reviewable.

## Alternatives considered

| Option                   | Why not                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Exceptions everywhere    | Invisible in signatures; easy to forget; encourages catch-all handlers that swallow real bugs. |
| Ad-hoc JSON error shapes | Every endpoint invents its own; clients cannot handle errors generically.                      |

## Revisit when

Never, realistically. If it changes, it changes everywhere at once.
