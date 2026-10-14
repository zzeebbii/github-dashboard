# ADR-0010: Container-first, cloud-neutral deployment

**Status:** Superseded by [ADR-0018](0018-static-host-agnostic-deployment.md)
**Date:** 2026-08-15

## Context

The application should be as platform-agnostic as reasonably possible without
pretending infrastructure does not exist.

## Decision

Multi-stage Docker builds producing distroless, non-root images, runnable on any
container host. Docker Compose with three profiles (`dev`, `prod-like`, `test`) for
local work. Deployment itself is a documented seam with a stub workflow, not a
hard-coded cloud target.

Application code contains **no cloud SDK**. Configuration arrives only as environment
variables (12-factor), validated by Zod at process start.

E2E runs against the `prod-like` profile — the same images, nginx config, and migration
path production uses.

## Consequences

- "Works in CI" and "works in production" are the same containers.
- The frontend production image is nginx serving static assets with `/api` proxied to
  the backend, so production needs no CORS at all.
- Health probes, graceful `SIGTERM` shutdown, and structured JSON logging ship from day
  one — retrofitting them is disproportionately painful.
- Cost: Docker is required locally. Accepted; it is required for tests anyway.
- Cost: no turnkey deploy. Deliberate — a real deploy is org-specific, and a wrong
  guess here is worse than an honest seam.

## Alternatives considered

| Option                        | Why not                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| Serverless/edge-first         | Constrains ORM and DB driver choices and complicates local fidelity.       |
| Opinionated single cloud      | Most production-ready, least portable. Contradicts platform independence.  |
| Kubernetes manifests included | Useful if K8s is certain; otherwise surface area a template does not need. |

## Revisit when

A deployment target is actually chosen. Add IaC alongside, not inside, the application.
