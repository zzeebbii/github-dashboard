# ADR-0012: Conventional Commits, generated changelog, breaking-change interlock

**Status:** Accepted
**Date:** 2026-08-15

## Context

The changelog must stay current without relying on anyone remembering, and "is this
change breaking?" must be answerable mechanically rather than by judgement.

## Decision

Conventional Commits, validated by commitlint in a `commit-msg` hook and on PR titles.
`CHANGELOG.md` is generated in Keep a Changelog format from commit history.

The important part is the **interlock**: `scripts/check-breaking-changes.mjs` diffs the
committed `artifacts/openapi.json` against the base branch and classifies each change.
If it finds a breaking change but no commit declares one (`feat!:` or a
`BREAKING CHANGE:` footer) and no `breaking-change` label is present, **CI fails**.

Breaking changes are permitted. Undeclared ones are not.

## Consequences

- "Is this breaking?" becomes a mechanical question with a machine-checked answer.
- The changelog cannot silently miss a breaking change.
- Agents already write structured commit messages reliably, so the ceremony is nearly
  free — and unlike a hand-edited changelog, there is nothing to merge-conflict over.
- Cost: the classifier is a structural OpenAPI diff we maintain. It is deliberately
  conservative — it flags removed fields, narrowed types, and newly required inputs.

## Alternatives considered

| Option                             | Why not                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Changesets                         | Better prose and explicit intent; the right choice once `@kit/contracts` is published. Costs a per-PR step agents skip. |
| Hand-edited changelog, CI-enforced | Constant merge conflicts on one file; enforcement is trivially satisfied without real content.                          |

## Revisit when

`@kit/contracts` is published to a registry — then Changesets becomes worth its cost.
