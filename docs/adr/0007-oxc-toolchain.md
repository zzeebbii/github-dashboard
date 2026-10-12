# ADR-0007: OXC (oxlint + oxfmt) replaces ESLint and Prettier

**Status:** Accepted
**Date:** 2026-08-15

## Context

The project targets TypeScript 7, which went GA on 8 July 2026. TS7 does **not** expose
a stable programmatic compiler API until 7.1. Tools that consume the compiler as a
library are therefore blocked: typescript-eslint closed TS7 support as "not planned"
for now, so its type-aware rules cannot run.

Oxlint's type-aware linting went stable on 22 July 2026, powered by `tsgolint`, which
runs directly on typescript-go rather than through the compiler API, and covers 59 of
typescript-eslint's 61 type-aware rules at 12–18x the speed.

## Decision

`oxlint` with `--type-aware` and `oxfmt` for formatting. No ESLint, no Prettier.

## Consequences

- On TypeScript 7 this is not a performance preference — it is currently the **only**
  viable type-aware linting path. The choice is load-bearing.
- The full lint runs in under a second, so it is realistic in a pre-commit hook.
- Type-aware rules caught real defects while building this repository, including an
  `init.headers` object-spread that silently corrupts `Headers` and tuple-array inputs.
- **Accepted deviation:** `oxfmt` is beta (0.63.0), not stable. It passes 100% of
  Prettier's JS/TS conformance suite and is ~30x faster. The exit cost is near zero —
  output is byte-identical to Prettier, so reverting is a one-line config change.
- A handful of ESLint rules have no oxlint equivalent yet. None were load-bearing here.

## Important operational note

Oxlint's type-aware mode discovers the **nearest `tsconfig.json`** for each file. If
that config excludes tests, type-aware rules silently degrade to `error` types on every
test file and stop catching anything there — while still reporting success.

This is why each package has two configs: `tsconfig.json` covers every file and emits
nothing (tooling), and `tsconfig.build.json` controls emit. See ADR-0013.

## Alternatives considered

| Option                     | Why not                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| ESLint + typescript-eslint | Cannot do type-aware linting on TypeScript 7 today.                          |
| Biome                      | Mature and fast, but no type-aware linting.                                  |
| Prettier instead of oxfmt  | The stable choice. Kept as the documented escape hatch; output is identical. |

## Revisit when

`oxfmt` reaches 1.0 (drop this caveat), or typescript-eslint gains TS7 support and
oxlint has fallen behind on rule coverage.
