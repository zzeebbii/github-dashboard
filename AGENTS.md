# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), which points at the same rules.

This file is deliberately short and navigational. Long instruction files get skimmed; this one is meant to be read in full, then followed into `docs/`.

---

## 60-second orientation

A personal, read-only GitHub pull-request dashboard. It is a single-page app with **no backend**: the browser calls GitHub directly with the signed-in account's token and caches results in the browser.

```
apps/web   React 19 + Vite + TanStack Router/Query. The whole product.
   │
   └── https://api.github.com   GraphQL + REST, called from the browser
e2e        Playwright, against the nginx prod-like build
docs/adr   Why it is built this way (start at ADR-0014)
```

The single most important rule: **only `apps/web/src/infrastructure/` may touch the network or browser storage.** The token lives in the browser, so where `fetch` and storage happen is a security boundary. CI enforces it.

---

## Commands

One command runs the CI checks, tests and build, with no Docker needed:

```bash
pnpm verify
```

Run it before you consider work finished. CI runs the same scripts. Only E2E, the guardrail self-test and the image scan run separately.

| Task                            | Command                                             |
| ------------------------------- | --------------------------------------------------- |
| Check the environment first     | `pnpm preflight`                                    |
| Everything (the full gate)      | `pnpm verify`                                       |
| Fast subset while iterating     | `pnpm verify:static`                                |
| Format / lint / types           | `pnpm format` · `pnpm lint` · `pnpm typecheck`      |
| Auto-fix                        | `pnpm format` then `pnpm lint:fix`                  |
| Unit tests                      | `pnpm test:unit`                                    |
| Component tests (real browser)  | `pnpm test:component`                               |
| E2E (needs the stack running)   | `pnpm stack:prod-like` then `pnpm test:e2e`         |
| Architecture rules              | `pnpm arch:check`                                   |
| Prove the guardrails still bite | `pnpm verify:guardrails`                            |
| Translation keys complete       | `pnpm i18n:check`                                   |
| Unused code and dependencies    | `pnpm deps:check`                                   |
| Run the app locally             | `pnpm dev` (Docker) or `pnpm --filter @ghd/web dev` |
| New decision record             | `pnpm adr:new "Title"`                              |

---

## Dependency rules — the architecture contract

Enforced by `dependency-cruiser`, `oxlint`, and TypeScript. You cannot merge a violation. Layers follow [ADR-0015](docs/adr/0015-frontend-hexagonal-layering.md).

```
apps/web/src/
  domain/          → imports nothing outside domain/. No Zod, React, TanStack or browser APIs.
  application/     → imports domain only. DEFINES ports + TanStack Query hooks. No infrastructure.
  infrastructure/  → implements ports. The ONLY place for fetch and browser storage.
  ui/              → presentational only. Props in, JSX out. No data fetching.
  features/        → composes application hooks + ui components.
  routes/          → TanStack Router route tree.
  config/env.ts    → the ONLY place import.meta.env is read.
```

- dependency-cruiser: `web-domain-is-pure`, `web-domain-no-zod`, `web-ui-is-presentational`, `web-application-no-infrastructure`, `web-no-direct-fetch`.
- oxlint: `fetch`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, `BroadcastChannel` and `navigator.locks` are banned outside `apps/web/src/infrastructure/**`.
- oxlint: `dangerouslySetInnerHTML`, `innerHTML`, `eval` and `new Function` are banned everywhere except `apps/web/src/ui/SafeHtml.tsx` (the one sanitising component).

Today `src/` has `domain/`, `application/`, `infrastructure/`, `ui/`, `features/`, `i18n/`, `routes/` and `config/`. Every signed-in screen renders inside `features/shell/AppShell.tsx` (sidebar, header, `main`); `/sign-in` stands outside it.

Full rationale: [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md).

---

## Where does this code go?

| What you are adding                                 | Where it goes                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| A PR rule (sections, re-review, staleness, sorting) | `apps/web/src/domain/`                                            |
| A new outside capability (GitHub, storage, tabs)    | Port in `apps/web/src/application/`, adapter in `infrastructure/` |
| A GitHub query or response schema                   | `apps/web/src/infrastructure/github/`                             |
| Server-state fetching                               | A TanStack Query hook in `apps/web/src/application/`              |
| A reusable visual component                         | `apps/web/src/ui/`                                                |
| A screen or feature                                 | `apps/web/src/features/`                                          |
| A route                                             | `apps/web/src/routes/`                                            |
| A build-time setting                                | `VITE_*` in `apps/web/src/config/env.ts` and `.env.example`       |

Worked example, layer by layer: **[docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)**. Follow it literally.

---

## Where validation schemas live

TypeScript types vanish at runtime, so boundaries are validated with Zod. But not everything is a boundary.

| Concern                | Schema lives in                        | Validated                         |
| ---------------------- | -------------------------------------- | --------------------------------- |
| GitHub API responses   | `apps/web/src/infrastructure/github/`  | On every response, before mapping |
| Cached / stored data   | The storage adapter                    | On read                           |
| Build-time environment | `apps/web/src/config/env.ts`           | At app load — **fail fast**       |
| **Domain rules**       | **NOT Zod** — plain types in `domain/` | By construction                   |

The last row is the one most often got wrong. **`domain/` must not import Zod.** The GitHub adapter parses responses and maps them onto plain domain types, so domain code only ever sees valid data. Zod guards boundaries; the type system guards the core.

---

## Testing policy

Default is **do not mock**. Details in [ADR-0019](docs/adr/0019-testing-a-browser-only-app.md).

| Layer                          | How to test it                                                          |
| ------------------------------ | ----------------------------------------------------------------------- |
| `domain/`, `application/`      | Real code, no mocks, no I/O. In-memory port fakes; injected clock.      |
| GitHub adapter                 | MSW in Node serving recorded fixtures from `apps/web/tests/fixtures/`   |
| IndexedDB / cross-tab adapters | Real browser APIs in Vitest browser mode                                |
| React components               | Real Chromium, in-memory ports, axe in both themes                      |
| Full journeys                  | Playwright against the prod-like stack, GitHub mocked with `page.route` |

`vi.mock` of an internal module is **banned**. Needing it means a dependency is missing a port; add the port instead.

If a domain test needs a mock, the architecture is wrong, not the test. Details: [docs/guides/testing.md](docs/guides/testing.md).

---

## Definition of Done

A change is done when all of these hold. Most are checked by `pnpm verify`.

1. `pnpm verify` passes locally.
2. New behaviour has tests at the appropriate layer (see the table above).
3. Coverage thresholds met for the layers you touched.
4. Changes to GitHub requests stay within the quota budget, and the budget tests pass ([ADR-0017](docs/adr/0017-indexeddb-cache-and-quota-budget.md)).
5. Every new UI string has a key in the English, Finnish and Swedish catalogues (`pnpm i18n:check` — [ADR-0021](docs/adr/0021-i18n-themes-and-accessibility.md)).
6. New or changed components pass axe in light and dark themes.
7. No new `oxlint-disable` without a `-- reason:` explaining why.
8. Docs updated if you changed structure, boundaries, commands, or data flow.
9. A new ADR if you made or reversed an architectural decision.
10. Conventional Commit messages (`type(scope): subject`); you can state what changed, why, and whether it is breaking.

---

## Things that will fail CI

Do not attempt these; they are blocked by design, and the fix is architectural, not a workaround.

- Importing anything outside `domain/` into `domain/`, including Zod
- Importing `infrastructure/` from `application/`
- Fetching data in `ui/`
- Calling `fetch` or browser storage outside `infrastructure/`
- Raw-HTML APIs (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) outside `ui/SafeHtml.tsx`
- Reading `import.meta.env` outside `config/env.ts`
- Leaving unused files, exports or dependencies (knip)
- `any`, non-null assertions, or floating promises

If a rule genuinely blocks legitimate work, that is a signal to change the rule **deliberately** — propose an ADR. Do not silence the check. Guardrail files are CODEOWNERS-protected and need human review.

---

## Conventions

- **Errors:** `Result` types in the domain; GitHub errors mapped once, in the GitHub adapter, to a `GitHubError` union the UI renders from. Never put a token in a message or log. See [docs/conventions/error-handling.md](docs/conventions/error-handling.md).
- **Tokens** go only to `api.github.com` (and, later, the token-exchange handler). See [ADR-0016](docs/adr/0016-auth-port-and-token-storage.md).
- **No parameter properties** (`constructor(private x)`): `erasableSyntaxOnly` is on. Declare fields explicitly.
- **Imports use real extensions** (`./sort.ts`, not `./sort.js`).
- Prefer explicit and boring over clever. This codebase optimises for being read, by humans and by agents.

---

## Key documents

| Document                                                                     | Read it when                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [docs/guides/adding-a-feature.md](docs/guides/adding-a-feature.md)           | Adding anything end to end                   |
| [docs/architecture/overview.md](docs/architecture/overview.md)               | You need the whole picture                   |
| [docs/conventions/dependency-rules.md](docs/conventions/dependency-rules.md) | A boundary check failed                      |
| [docs/guides/testing.md](docs/guides/testing.md)                             | Deciding how to test something               |
| [docs/guides/local-development.md](docs/guides/local-development.md)         | Getting the app running                      |
| [docs/adr/](docs/adr/)                                                       | You want to know _why_ something is this way |
