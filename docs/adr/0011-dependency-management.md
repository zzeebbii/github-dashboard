# ADR-0011: Pinned dependencies, pnpm 11 hardening, Renovate automation

**Status:** Accepted
**Date:** 2026-08-15

## Context

"Always use the latest" must not mean upgrading blindly. Reproducibility and supply
chain integrity matter more than being current.

## Decision

- **Exact versions** for all direct dependencies (no `^`), enforced by syncpack.
  Lockfile committed; `--frozen-lockfile` everywhere in CI.
- **pnpm 11 supply-chain defaults are kept on:**
  - Dependency lifecycle scripts are blocked by default. Every exception is an explicit,
    reviewed entry in `pnpm-workspace.yaml` under `allowBuilds`. Currently only
    `esbuild` is allowed; `ssh2`, `cpu-features`, `protobufjs`, and `msw` are explicitly
    denied because they work without their build steps.
  - `minimumReleaseAge` refuses very recently published packages, blunting a
    compromised-release attack. Exceptions are listed per pinned version.
- **Renovate** groups related packages (vitest, oxc, tanstack, react) and auto-merges
  patch/minor **only if the full verify suite passes**. Majors always need a human.
  TypeScript and Drizzle never auto-merge: TS7 support gates several tools, and
  Drizzle's 0.x minors are effectively majors.
- A weekly scheduled CI run on unchanged `main` catches drift and base-image CVEs while
  the repository is idle — which is when a template is most likely to rot unnoticed.

## Consequences

- Builds are byte-reproducible.
- A compromised package cannot execute code merely by being installed.
- Adding a build exception is visibly a security decision, in a reviewed file.
- Cost: exact pinning means more Renovate PRs. They auto-merge when green.

## Revisit when

The `allowBuilds` list grows beyond a handful, which would suggest a dependency is
doing more at install time than it should.
