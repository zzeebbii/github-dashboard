# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are generated from Conventional Commits — run `pnpm changelog`. Do not
hand-edit released sections; fix the commit message convention instead.

<!-- newest-first -->

## [0.1.0] - 2026-08-15

Initial release of the starter kit.

### Added

- **contracts:** Zod 4 API contract with framework-neutral endpoint descriptors, and a
  generator emitting a committed OpenAPI 3.1 document
- **api:** Hono 4 backend on Node 24 with hexagonal layers (domain → application →
  infrastructure → http) and an explicit composition root
- **api:** PostgreSQL 17 via Drizzle behind a repository port, with committed SQL
  migrations applied by a dedicated one-shot container
- **api:** RFC 9457 problem details, health probes, structured logging, graceful shutdown
- **web:** React 19 SPA with Vite 8, TanStack Router (code-based) and Query, and an API
  port resolved through context so components never touch the network
- **testing:** Vitest 4 unit tests, real-browser component tests, Testcontainers
  integration tests against real PostgreSQL, and Playwright E2E against the
  production-like stack
- **ci:** GitHub Actions running every gate, plus Trivy, CodeQL-ready SARIF upload, and
  GHCR image publishing
- **docker:** Distroless non-root images and a single Compose file with dev, prod-like,
  and test profiles
- **docs:** Architecture overview with C4 diagrams, 13 ADRs, conventions, and guides
- **agents:** `AGENTS.md` plus machine-enforced architecture rules via
  dependency-cruiser, oxlint, TypeScript project references, and knip
