# Local development

## One command

```bash
docker compose --profile dev up
```

Brings up PostgreSQL, applies migrations, and starts the API (port 3000) and the SPA
with hot reload (port 5173). Nothing else to install beyond Docker.

Check your environment first if anything looks wrong:

```bash
pnpm preflight   # Node version, pnpm, Docker daemon — with actionable messages
```

## Prerequisites

| Tool   | Version    | Why that version                                           |
| ------ | ---------- | ---------------------------------------------------------- |
| Docker | any recent | The stack, integration tests, E2E                          |
| Node   | 24.x       | Active LTS. Pinned in `.nvmrc`, `engines`, and the images. |
| pnpm   | 11.22.0    | Pinned via `packageManager`; `corepack enable` is enough   |

Node 26 becomes LTS in October 2026. Bumping is a deliberate, ADR-tracked change, not
an automatic one.

## The three profiles

| Profile     | Command                            | What it is for                          |
| ----------- | ---------------------------------- | --------------------------------------- |
| `dev`       | `docker compose --profile dev up`  | Hot reload, source bind-mounted         |
| `prod-like` | `pnpm stack:prod-like`             | The real images. E2E runs against this. |
| `test`      | `docker compose --profile test up` | Just the database                       |

Use `prod-like` before opening a PR that touches Docker, nginx, or the build. It is the
same thing CI runs.

## Faster iteration on the host

Containerised hot reload is convenient but slower than native. To run the apps directly
against containerised infrastructure:

```bash
docker compose --profile test up -d      # database only
cp .env.example .env
pnpm install
pnpm --filter @kit/contracts build       # both apps import this
pnpm --filter @kit/api dev
pnpm --filter @kit/web dev
```

## Everyday commands

```bash
pnpm verify            # the entire CI gate, locally
pnpm verify:static     # format + lint + types + architecture (fast)
pnpm format            # fix formatting
pnpm lint:fix          # fix what is auto-fixable
pnpm db:generate       # new migration after editing schema.ts
pnpm contract:generate # after any change to packages/contracts
```

## Troubleshooting

**A large `.pnpm-store/` appeared in my checkout.**
pnpm keeps its store on the same filesystem as `node_modules`. In container workflows
the repo is a mounted volume, so pnpm creates the store there unless told otherwise.
The compose services set `PNPM_STORE_DIR` to a named volume to prevent this; it is also
gitignored. Safe to delete — it is a cache.

**Port already in use.** The stack uses 5432, 3000, 5173, and 8080.
`docker compose --profile dev down -v` clears a previous run, volumes included.

**Integration tests hang or time out.** Docker is not running. `pnpm preflight` says so
in one line.

**The API exits immediately on start.** Environment validation failed. The error names
the offending variable; compare against `.env.example`.

**Types are stale after changing contracts.** `pnpm --filter @kit/contracts build`.
Both apps consume the built declarations.
