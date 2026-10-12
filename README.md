# Agentic Fullstack Starter Kit

A production-grade React + TypeScript starter, built so that **AI coding agents can work in it with minimal supervision** — and so that the backend stays replaceable.

```bash
git clone <this-repo> && cd agentic-fullstack-starter-kit
docker compose --profile dev up
```

That is the whole setup. PostgreSQL, migrations, API, and SPA with hot reload.

- SPA → http://localhost:5173
- API → http://localhost:3000

## What is in the box

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Frontend** | React 19 · Vite 8 (Rolldown) · TanStack Router + Query · TypeScript 7 strict      |
| **Backend**  | Hono 4 on Node 24 LTS · hexagonal layers · PostgreSQL 17 · Drizzle                |
| **Contract** | Zod 4 schemas → committed OpenAPI 3.1, with drift and breaking-change detection   |
| **Testing**  | Vitest 5 (unit + real-browser components) · Testcontainers · Playwright           |
| **Quality**  | oxlint with type-aware rules · oxfmt · dependency-cruiser · knip                  |
| **Ops**      | Distroless non-root images · Compose profiles · GitHub Actions · Trivy · Renovate |

## The two ideas that shape everything

**1. The frontend and backend share a contract, not code.**

`packages/contracts` holds Zod schemas and nothing else. It generates
`artifacts/openapi.json`, which is committed and is the language-neutral contract of
record. `apps/web` never imports `apps/api` — CI enforces it — so the backend can be
replaced by .NET, Go, or Java without touching the frontend.

The honest test of that claim: delete `apps/api`, and the frontend, contracts, and E2E
suite still typecheck and describe a complete system.

**2. Architectural rules are machine-enforced, not documented.**

`domain/` imports nothing. `application/` defines ports; `infrastructure/` implements
them. Reading `process.env` outside `config/env.ts` fails the build. So does a
contract change without a regenerated spec, an unused export, or a floating promise.

An agent cannot merge an architectural violation, regardless of what it believes it is
doing. That is what makes hands-off development safe.

## One command to validate everything

```bash
pnpm verify
```

Format, lint (type-aware), typecheck, architecture rules, contract drift, dead code,
dependency consistency, unit tests, component tests, integration tests, and builds —
the same script CI runs, so there is no CI-only surprise.

```bash
pnpm preflight          # check Node/pnpm/Docker before anything else
pnpm verify:static      # the fast subset while iterating
pnpm test:e2e           # after: pnpm stack:prod-like
pnpm contract:breaking  # is my API change breaking?
```

## Layout

```
apps/api           domain → application → infrastructure → http
apps/web           domain → application → infrastructure → ui → features → routes
packages/contracts Zod schemas. The API contract. Zod is its only dependency.
packages/testing   Shared fixtures and deterministic clock/id helpers
e2e                Playwright, against the production-like stack
artifacts/         openapi.json — committed, generated, drift-checked
docs/              architecture · adr · guides · conventions
```

## Documentation

Start with **[AGENTS.md](AGENTS.md)** — it is the entry point for agents and the
fastest orientation for humans too.

| Document                                                                     | For                               |
| ---------------------------------------------------------------------------- | --------------------------------- |
| [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)           | Adding anything, layer by layer   |
| [docs/architecture/overview.md](docs/architecture/overview.md)               | The whole picture, with diagrams  |
| [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md) | The rules and why they exist      |
| [docs/guides/testing.md](docs/guides/testing.md)                             | What to test where                |
| [docs/guides/local-development.md](docs/guides/local-development.md)         | Running and troubleshooting       |
| [docs/guides/replacing-the-backend.md](docs/guides/replacing-the-backend.md) | Swapping in another language      |
| [docs/adr/](docs/adr/)                                                       | Why every major decision was made |

## Using this as a template

1. Create a repository from this template (GitHub's **Use this template**), clone it,
   and run `pnpm install`.
2. Initialise it — one command, run once:

   ```bash
   pnpm init-project my-dashboard --owner @your-github-user
   ```

   It renames the `@kit/*` packages, the root package, and the Compose project; sets
   the title (`--title`, defaults to "My Dashboard"), the CODEOWNERS owner, and the
   `ProblemTypes` URLs (`--problem-base`, defaults to `https://<name>.example/problems`);
   resets the changelog; regenerates the lockfile and `artifacts/openapi.json`; and
   removes itself and this section. It refuses a dirty working tree, so
   `git checkout .` undoes it. Then `pnpm verify` and commit.

3. Replace the `Task` slice with your first real feature — copy its shape, it exists to
   be imitated.
4. Add a deploy step; `.github/workflows/ci.yml` publishes images to GHCR and stops
   there deliberately.

## Notable version choices

Node **24 LTS** (Node 26 becomes LTS in October 2026 — a deliberate, ADR-tracked bump).
TypeScript **7.0.2**, the Go-native compiler. That last choice is why the toolchain is
OXC rather than ESLint: typescript-eslint cannot do type-aware linting on TS7 until the
stable compiler API lands in 7.1, while oxlint's tsgolint runs on typescript-go
directly. See [ADR-0007](docs/adr/0007-oxc-toolchain.md) and
[ADR-0013](docs/adr/0013-typescript-7-adoption.md).

## Licence

MIT — see [LICENSE](LICENSE).
