# GitHub Dashboard

A personal, read-only dashboard for GitHub pull requests. It runs entirely in the
browser: there is no backend. The app calls the GitHub API directly with your token
and caches results in the browser.

Work in progress. Today the app is a placeholder home page plus the domain rules for
sorting pull requests into Home sections. Sign-in, the GitHub client and the real
views are being built; the decisions behind them are in
[ADR-0014 to ADR-0021](docs/adr/).

```bash
pnpm install
pnpm --filter @ghd/web dev   # http://localhost:5173
```

Or with Docker: `pnpm dev`.

## What is in the box

|             |                                                                                     |
| ----------- | ----------------------------------------------------------------------------------- |
| **App**     | React 19 · Vite 8 · TanStack Router + Query · Zod 4 · TypeScript 7 strict           |
| **Data**    | GitHub GraphQL + REST, called from the browser; IndexedDB cache (planned)           |
| **Testing** | Vitest 5 (unit + real-browser components) · Playwright                              |
| **Quality** | oxlint with type-aware rules · oxfmt · dependency-cruiser · knip                    |
| **Ops**     | Static build served by nginx · Compose profiles · GitHub Actions · Trivy · Renovate |

## Two ideas that shape everything

**1. No backend.** All data lives in GitHub, and GitHub allows browser calls, so a
server of our own would only forward requests. The build is plain static files that
any host can serve ([ADR-0014](docs/adr/0014-spa-only-browser-direct-github-access.md),
[ADR-0018](docs/adr/0018-static-host-agnostic-deployment.md)).

**2. Architectural rules are machine-enforced.** The token lives in the browser, so
only `apps/web/src/infrastructure/` may touch the network or browser storage, and
raw-HTML APIs are banned outside one sanitising component. `domain/` imports nothing.
Breaking a rule fails the build ([ADR-0015](docs/adr/0015-frontend-hexagonal-layering.md)).

## One command to validate everything

```bash
pnpm verify
```

Format, lint (type-aware), typecheck, architecture rules, dead code, dependency
consistency, unit tests, component tests, and the build. CI runs the same scripts.

```bash
pnpm preflight          # check Node, pnpm and Docker first
pnpm verify:static      # the fast subset while iterating
pnpm test:e2e           # after: pnpm stack:prod-like
```

## Layout

```
apps/web    domain → application → infrastructure → ui → features → routes
e2e         Playwright, against the production-like stack
docs/       architecture · adr · guides · conventions
scripts/    preflight, guardrail self-test, ADR and changelog helpers
```

## Documentation

Start with **[AGENTS.md](AGENTS.md)**. It is the entry point for agents and the
fastest orientation for humans too.

| Document                                                                     | For                               |
| ---------------------------------------------------------------------------- | --------------------------------- |
| [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)           | Adding anything, layer by layer   |
| [docs/architecture/overview.md](docs/architecture/overview.md)               | The whole picture                 |
| [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md) | The rules and why they exist      |
| [docs/guides/testing.md](docs/guides/testing.md)                             | What to test where                |
| [docs/guides/local-development.md](docs/guides/local-development.md)         | Running and troubleshooting       |
| [docs/adr/](docs/adr/)                                                       | Why every major decision was made |

## Notable version choices

Node **24 LTS**. TypeScript **7.0.2**, the Go-native compiler. That is why the
toolchain is OXC rather than ESLint: typescript-eslint cannot do type-aware linting on
TS7 until the stable compiler API lands in 7.1, while oxlint's tsgolint runs on
typescript-go directly. See [ADR-0007](docs/adr/0007-oxc-toolchain.md) and
[ADR-0013](docs/adr/0013-typescript-7-adoption.md).

## Licence

MIT — see [LICENSE](LICENSE).
