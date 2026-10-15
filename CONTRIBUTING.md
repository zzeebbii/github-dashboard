# Contributing

Humans and AI agents follow the same rules. **[AGENTS.md](AGENTS.md)** is the single
source of truth for conventions; this document covers the human workflow around it.

## Setup

```bash
corepack enable
pnpm install
pnpm preflight            # checks Node, pnpm and Docker
pnpm --filter @ghd/web dev
```

Docker is only needed for `pnpm dev`, the prod-like stack and E2E.

## The loop

1. Branch from `main`.
2. Make the change, following
   [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md).
3. `pnpm verify` — the same checks CI runs.
4. Commit using Conventional Commits.
5. Open a PR. CI re-runs everything, plus E2E and the image scan.

## Commit messages

```
type(scope): subject

feat(web): show the review reason chip on each row
fix(web): stop the Home list flickering on refresh
ci: cache Playwright browsers
```

Types: `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore` `revert`.
Scopes: `web` `e2e` `docker` `ci` `docs` `deps` `scripts`.

Validated by commitlint on commit and on the PR title (we squash-merge, so the PR title
becomes the commit).

## Breaking changes

Mark a change users must react to (lost settings, a dropped feature, a new required
config value) with `!` (`feat(web)!:`) or a `BREAKING CHANGE:` footer. It drives the
changelog. If it reverses an architectural decision, add an ADR:
`pnpm adr:new "Title"`.

## Definition of Done

See [AGENTS.md](AGENTS.md#definition-of-done). Most of it is checked by `pnpm verify`;
the rest is docs, ADRs, and being able to explain the change.

## Changing the guardrails

`.dependency-cruiser.cjs`, `.oxlintrc.json`, `.github/`, the Dockerfile, nginx config
and `docs/adr/` are CODEOWNERS-protected. Changing a rule needs a human reviewer and,
for architectural rules, an ADR explaining why.

If a rule blocks legitimate work, that is worth discussing — but the fix is to change
the rule deliberately, never to add an ignore or downgrade it to a warning.

## Reporting a security issue

Do not open a public issue. Contact the maintainer directly.
