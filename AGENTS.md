# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), which points at the same rules.

This file is deliberately short and navigational. Long instruction files get skimmed; this one is meant to be read in full, then followed into `docs/`.

---

## 60-second orientation

A React SPA and a Hono API that share **one contract** and nothing else.

```
packages/contracts   Zod schemas. The API contract. Zod is its ONLY dependency.
        │
        ├── apps/api   Hono + hexagonal layers + PostgreSQL (Drizzle)
        └── apps/web   React 19 + Vite + TanStack Router/Query
artifacts/openapi.json   Generated from contracts. COMMITTED. The language-neutral spec.
```

The single most important rule: **`apps/web` must never import from `apps/api`.** They communicate over HTTP, described by the contract. This is what keeps the backend replaceable by .NET, Go, or Java. CI enforces it.

---

## Commands

One command reproduces the entire CI gate:

```bash
pnpm verify
```

Run it before you consider work finished. It is the same script CI runs, so there is no "CI-only" failure to be surprised by.

| Task                                    | Command                                        |
| --------------------------------------- | ---------------------------------------------- |
| Check the environment first             | `pnpm preflight`                               |
| Everything (the full gate)              | `pnpm verify`                                  |
| Fast subset while iterating             | `pnpm verify:static`                           |
| Format / lint / types                   | `pnpm format` · `pnpm lint` · `pnpm typecheck` |
| Auto-fix                                | `pnpm format` then `pnpm lint:fix`             |
| Unit tests                              | `pnpm test:unit`                               |
| Component tests (real browser)          | `pnpm test:component`                          |
| Integration tests (real Postgres)       | `pnpm test:integration`                        |
| E2E (needs the stack running)           | `pnpm stack:prod-like` then `pnpm test:e2e`    |
| Architecture rules                      | `pnpm arch:check`                              |
| Regenerate the API contract             | `pnpm contract:generate`                       |
| Is my API change breaking?              | `pnpm contract:breaking`                       |
| Run the whole app locally               | `docker compose --profile dev up`              |
| New migration (after editing schema.ts) | `pnpm db:generate`                             |
| New decision record                     | `pnpm adr:new "Title"`                         |

---

## Dependency rules — the architecture contract

Enforced by `dependency-cruiser`, `oxlint`, and TypeScript project references. You cannot merge a violation.

```
apps/api/src/
  domain/          → imports NOTHING. Not Zod, not Hono, not Node builtins.
  application/     → imports domain only. DEFINES ports; never imports adapters.
  infrastructure/  → imports domain + application. Implements ports.
  http/            → imports all of the above. Hono lives here and nowhere else.
  config/env.ts    → the ONLY place process.env is read.

apps/web/src/
  domain/          → framework-free model code.
  application/     → hooks + the TaskApi port. No fetch.
  infrastructure/  → the ONLY place that touches the network.
  ui/              → presentational only. Props in, JSX out. No data fetching.
  features/        → composes application + ui.

packages/contracts → Zod ONLY. No app imports. No helpers. No utilities.
apps/web           → NEVER imports apps/api (and vice versa).
```

Full rationale: [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md).

---

## Where does this code go?

| What you are adding                                    | Where it goes                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| A business rule or invariant                           | `apps/api/src/domain/`                                          |
| Orchestration of a workflow                            | `apps/api/src/application/` (a use case)                        |
| A new external dependency (DB, queue, third-party API) | Port in `application/ports.ts`, adapter in `infrastructure/`    |
| A new HTTP endpoint                                    | Contract in `packages/contracts`, route in `apps/api/src/http/` |
| A new API field                                        | `packages/contracts` first, then both sides                     |
| A reusable visual component                            | `apps/web/src/ui/`                                              |
| A screen or feature                                    | `apps/web/src/features/`                                        |
| Server-state fetching                                  | `apps/web/src/application/tasks/use-*.ts`                       |
| Anything touching the network from the frontend        | `apps/web/src/infrastructure/`                                  |

Worked example, layer by layer: **[docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)**. Follow it literally.

---

## Where validation schemas live

TypeScript types vanish at runtime, so boundaries are validated with Zod. But not everything is a boundary.

| Concern                   | Schema lives in                         | Validated                                      |
| ------------------------- | --------------------------------------- | ---------------------------------------------- |
| API request / response    | `packages/contracts`                    | Backend on the way in; frontend on the way out |
| Environment variables     | `apps/*/src/config/env.ts`              | At process start — **fail fast**               |
| Third-party API responses | The infrastructure adapter              | At the adapter boundary                        |
| Database rows             | The repository adapter                  | On read, when the schema is not ours           |
| **Domain invariants**     | **NOT Zod** — constructors in `domain/` | At construction                                |

The last row is the one most often got wrong. **`domain/` must not import Zod.** Domain invariants use branded types and factory functions returning `Result`, so an invalid domain object is _unconstructible_ rather than merely detectable. Zod guards boundaries; the type system guards the core.

---

## Testing policy

Default is **do not mock**.

| Layer                     | How to test it                                             |
| ------------------------- | ---------------------------------------------------------- |
| `domain/`, `application/` | Real code, no mocks, no I/O. Use the in-memory port fakes. |
| Repository adapters       | Real PostgreSQL via Testcontainers (`tests/integration/`)  |
| React components          | Real browser, Vitest browser mode, in-memory `TaskApi`     |
| Full journeys             | Playwright against the prod-like Docker stack              |
| Third-party HTTP          | MSW at the network layer — never module mocking            |

`vi.mock` of an internal module is **banned**. Needing it means a dependency is missing a port; add the port instead.

If a domain test needs a mock, the architecture is wrong, not the test. Details: [docs/guides/testing.md](docs/guides/testing.md).

---

## Definition of Done

A change is done when all of these hold. Most are checked by `pnpm verify`.

1. `pnpm verify` passes locally.
2. New behaviour has tests at the appropriate layer (see the table above).
3. Coverage thresholds met for the layers you touched.
4. Contract changes: `pnpm contract:generate` run and `artifacts/openapi.json` committed.
5. Breaking contract changes are declared — `feat!:`/`BREAKING CHANGE:`, a `breaking-change` label, **and** an ADR.
6. No new `oxlint-disable` without a `-- reason:` explaining why.
7. Docs updated if you changed structure, boundaries, commands, or data flow.
8. A new ADR if you made or reversed an architectural decision.
9. Conventional Commit messages (`type(scope): subject`).
10. You can state what changed, why, and whether it is breaking.

---

## Things that will fail CI

Do not attempt these; they are blocked by design, and the fix is architectural, not a workaround.

- Importing `infrastructure` from `domain` or `application`
- Importing anything into `domain/` at all
- Importing `apps/api` from `apps/web`
- Adding any dependency other than Zod to `packages/contracts`
- Reading `process.env` outside `config/env.ts`
- Changing a schema without regenerating `artifacts/openapi.json`
- Breaking the API contract without declaring it
- Leaving unused exports or dependencies (knip)
- `any`, non-null assertions, or floating promises

If a rule genuinely blocks legitimate work, that is a signal to change the rule **deliberately** — propose an ADR. Do not silence the check. Guardrail files are CODEOWNERS-protected and need human review.

---

## Conventions

- **Errors:** RFC 9457 `application/problem+json` at the HTTP edge; `Result` types in the domain. Exceptions are for genuinely exceptional cases. See [docs/conventions/error-handling.md](docs/conventions/error-handling.md).
- **No parameter properties** (`constructor(private x)`): `erasableSyntaxOnly` is on so Node can strip types natively. Declare fields explicitly.
- **Imports use real extensions** (`./task.ts`, not `./task.js`). TypeScript rewrites them on emit.
- **Branded ids** are constructed only via their `toXId()` helper.
- Prefer explicit and boring over clever. This codebase optimises for being read, by humans and by agents.

---

## Key documents

| Document                                                                     | Read it when                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)           | Adding anything end to end                   |
| [docs/architecture/overview.md](docs/architecture/overview.md)               | You need the whole picture                   |
| [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md) | A boundary check failed                      |
| [docs/guides/testing.md](docs/guides/testing.md)                             | Deciding how to test something               |
| [docs/guides/local-development.md](docs/guides/local-development.md)         | Getting the stack running                    |
| [docs/guides/replacing-the-backend.md](docs/guides/replacing-the-backend.md) | Swapping the API for another language        |
| [docs/adr/](docs/adr/)                                                       | You want to know _why_ something is this way |
