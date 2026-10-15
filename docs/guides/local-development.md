# Local development

## Quickest start

```bash
corepack enable
pnpm install
pnpm --filter @ghd/web dev    # Vite with hot reload on http://localhost:5173
```

No backend and no database to start. The app talks to GitHub directly.

Check your environment first if anything looks wrong:

```bash
pnpm preflight   # Node version, pnpm, Docker daemon — with actionable messages
```

## Prerequisites

| Tool   | Version    | Why                                                        |
| ------ | ---------- | ---------------------------------------------------------- |
| Node   | 24.x       | Active LTS. Pinned in `.nvmrc`, `engines`, and the images. |
| pnpm   | 11.22.0    | Pinned via `packageManager`; `corepack enable` is enough   |
| Docker | any recent | Only for the Compose profiles and E2E                      |

## The two Compose profiles

| Profile     | Command                | What it is for                                                   |
| ----------- | ---------------------- | ---------------------------------------------------------------- |
| `dev`       | `pnpm dev`             | Vite in a container, source bind-mounted, port 5173              |
| `prod-like` | `pnpm stack:prod-like` | The real build behind nginx on port 8080. E2E runs against this. |

Use `prod-like` before opening a PR that touches Docker, nginx, or the build. It is the
same thing CI runs. `pnpm dev:down` stops the dev profile and removes its volumes.

## Configuration

Build-time settings are `VITE_*` variables, read only in `apps/web/src/config/env.ts`.
Copy `.env.example` to `.env` to set them. None are required yet. Everything behind
`VITE_` ships to the browser, so never put a secret there.

## Everyday commands

```bash
pnpm verify            # the CI checks, tests and build, locally
pnpm verify:static     # format + lint + types + architecture + dead code (fast)
pnpm format            # fix formatting
pnpm lint:fix          # fix what is auto-fixable
pnpm test:unit         # domain and other pure logic
pnpm test:component    # components in real Chromium
```

## Troubleshooting

**A large `.pnpm-store/` appeared in my checkout.**
pnpm keeps its store on the same filesystem as `node_modules`. In the dev container the
repo is a mounted volume, so pnpm would create the store there. The compose service
sets `PNPM_STORE_DIR` to a named volume to prevent this; it is also gitignored. Safe to
delete — it is a cache.

**Port already in use.** The stack uses 5173 and 8080.
`pnpm dev:down` clears a previous dev run.

**Component tests cannot find a browser.** Install Chromium for Playwright:
`pnpm --filter @ghd/web exec playwright install chromium`.

**The app shows an environment error on load.** `config/env.ts` rejected a `VITE_*`
value. The message names the variable; compare against `.env.example`.
