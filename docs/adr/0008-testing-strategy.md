# ADR-0008: Test at real boundaries; do not mock by default

**Status:** Accepted
**Date:** 2026-08-15

## Context

The most common way AI-written tests fail is by passing while the code is broken —
usually because the test mocks the thing it should be exercising. Optimising for test
count rather than confidence makes this worse.

## Decision

A layered policy, stated as a lookup table in `AGENTS.md`:

| Layer               | Approach                                                   |
| ------------------- | ---------------------------------------------------------- |
| domain, application | No mocks, no I/O. In-memory implementations of ports.      |
| Repository adapters | Real PostgreSQL via Testcontainers.                        |
| Components          | Real Chromium (Vitest 4 browser mode), in-memory API port. |
| Journeys            | Playwright against the prod-like Docker stack.             |
| Third-party HTTP    | MSW at the network layer.                                  |

`vi.mock` of internal modules is banned by policy. Needing it means a dependency is
missing a port.

Coverage thresholds are **per layer**, not one global number: 95% for domain and
application (pure code, no excuse), 70% for adapters and HTTP, 80% for frontend.

## Consequences

- Integration failures are real failures; nobody chases mock-fidelity ghosts.
- Real-browser component tests avoid jsdom's false greens on focus, layout, and scroll
  — exactly where agent-written UI bugs hide.
- Per-layer thresholds direct effort at code where tests carry information. A single
  global number is trivially gamed by testing easy code.
- Cost: slower than an all-mocks suite. Integration tests take ~17s including container
  startup. Worth it.
- Cost: Docker is required for local development. It already was.

## Alternatives considered

| Option                 | Why not                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite for tests       | A repository verified against a different engine tests nothing that matters — dialect, constraints, transactions, and timestamps all differ. |
| jsdom for components   | Faster, but passes on behaviour that genuinely breaks in a browser.                                                                          |
| Global coverage number | Gamed by testing trivial code.                                                                                                               |

## Revisit when

Integration tests become slow enough to hurt the feedback loop. Fix with container
reuse and template-database snapshots before weakening fidelity.
