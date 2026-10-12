# ADR-0005: Architecture rules are machine-enforced and blocking

**Status:** Accepted
**Date:** 2026-08-15

## Context

The repository is designed for AI agents working with minimal supervision. Documented
conventions are insufficient: an agent (or a human in a hurry) will follow the path of
least resistance. Warnings get ignored, and architecture erodes one convenient import
at a time.

## Decision

Every architectural rule is enforced by a **blocking** check, in four independent
layers:

1. **TypeScript project references** — `domain` cannot resolve `infrastructure`.
2. **dependency-cruiser** — the full ruleset, `severity: error`, blocking in CI.
3. **oxlint `no-restricted-imports`** — the same rules, instantly in the editor.
4. **pnpm strict `node_modules`** — no phantom transitive imports.

Guardrail files (`.dependency-cruiser.cjs`, `.oxlintrc.json`, `.github/`, `docs/adr/`,
`packages/contracts/`) are CODEOWNERS-protected: an agent may propose changes but
cannot merge them.

## Consequences

- An agent cannot merge an architectural violation regardless of intent.
- Review is about intent, not compliance, because compliance is automatic.
- Failure messages name the rule, the file, and the doc that explains it — a failing
  check teaches rather than merely blocking.
- Cost: legitimate work occasionally hits a rule. The remedy is to change the rule
  deliberately via an ADR, never to silence the check.
- Cost: four overlapping mechanisms is redundant by design. A single mechanism gets
  worked around.

## Alternatives considered

| Option                    | Why not                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Documentation only        | Unenforced conventions decay; this is the exact failure mode the repo exists to prevent.                  |
| Warn first, tighten later | Warnings are ignored. Tightening later means fixing accumulated violations, which never gets prioritised. |

## Revisit when

A rule blocks legitimate work repeatedly. That is evidence the rule is wrong, not that
enforcement is wrong.
