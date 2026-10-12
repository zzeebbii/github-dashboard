# Architecture Decision Records

Why things are the way they are. Read these before proposing a structural change —
most "obvious improvements" were already considered and rejected for a stated reason.

Format: [MADR](https://adr.github.io/madr/)-style. Numbered sequentially, never
deleted. A decision that is reversed gets a new ADR, and the old one is marked
**Superseded** with a link forward.

| ADR                                                       | Decision                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| [0001](0001-monorepo-with-extractable-contracts.md)       | pnpm monorepo with an extractable contracts package           |
| [0002](0002-contract-first-with-zod-and-openapi.md)       | Zod contracts as source of truth, OpenAPI as the artifact     |
| [0003](0003-framework-light-react.md)                     | Framework-light React, no meta-framework                      |
| [0004](0004-hono-hexagonal-backend.md)                    | Hono on Node 24 with hexagonal architecture                   |
| [0005](0005-machine-enforced-architecture.md)             | Architecture rules are machine-enforced and blocking          |
| [0006](0006-drizzle-behind-repository-ports.md)           | Drizzle behind repository ports, PostgreSQL 17                |
| [0007](0007-oxc-toolchain.md)                             | OXC replaces ESLint and Prettier                              |
| [0008](0008-testing-strategy.md)                          | Test at real boundaries; do not mock by default               |
| [0009](0009-rfc9457-error-handling.md)                    | RFC 9457 at the edge, Result types in the core                |
| [0010](0010-container-first-deployment.md)                | Container-first, cloud-neutral deployment                     |
| [0011](0011-dependency-management.md)                     | Pinned dependencies, pnpm hardening, Renovate                 |
| [0012](0012-conventional-commits-and-breaking-changes.md) | Conventional Commits and the breaking-change interlock        |
| [0013](0013-typescript-7-adoption.md)                     | Adopt TypeScript 7, with a private TS6 for dependency-cruiser |

## Writing a new one

```bash
pnpm adr:new "Short decision title"
```

CI expects a new ADR when a PR changes the dependency rules, the contracts package in a
breaking way, or adds a dependency to `domain/`.
