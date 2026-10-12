# Contributing

Humans and AI agents follow the same rules. **[AGENTS.md](AGENTS.md)** is the single
source of truth for conventions; this document covers the human workflow around it.

## Setup

```bash
corepack enable
pnpm install
pnpm preflight            # verifies Node, pnpm, and Docker
docker compose --profile dev up
```

## The loop

1. Branch from `main`.
2. Make the change, following
   [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md).
3. `pnpm verify` — the same gate CI runs.
4. Commit using Conventional Commits.
5. Open a PR. CI re-runs everything and classifies contract changes.

## Commit messages

```
type(scope): subject

feat(api): add due dates to tasks
fix(web): stop the task list flickering on refetch
feat(contracts)!: remove the deprecated status field
```

Types: `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore` `revert`.
Scopes: `api` `web` `contracts` `testing` `e2e` `docker` `ci` `docs` `deps`.

Validated by commitlint on commit and on the PR title (we squash-merge, so the PR title
becomes the commit).

The `!` marker matters: it is cross-checked against the OpenAPI diff. If the contract
breaks but no commit says so, CI fails.

## Breaking API changes

Permitted; undeclared ones are not. All three are required:

1. `feat(api)!:` or a `BREAKING CHANGE:` footer
2. A `breaking-change` label on the PR
3. An ADR — `pnpm adr:new "Why the contract changed"`

Check before pushing:

```bash
pnpm contract:breaking
```

## Definition of Done

See [AGENTS.md](AGENTS.md#definition-of-done). Most of it is checked by `pnpm verify`;
the rest is docs, ADRs, and being able to explain the change.

## Changing the guardrails

`.dependency-cruiser.cjs`, `.oxlintrc.json`, `.github/`, `packages/contracts/`, the
Dockerfiles, and `docs/adr/` are CODEOWNERS-protected. Changing a rule needs a human
reviewer and, for architectural rules, an ADR explaining why.

If a rule blocks legitimate work, that is worth discussing — but the fix is to change
the rule deliberately, never to add an ignore or downgrade it to a warning.

## Reporting a security issue

Do not open a public issue. Contact the maintainers directly.
