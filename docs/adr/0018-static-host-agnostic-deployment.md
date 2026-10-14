# ADR-0018: Static, host-agnostic deployment

**Status:** Accepted
**Date:** 2026-10-13

Supersedes [ADR-0010](0010-container-first-deployment.md).

## Context

With no backend ([ADR-0014](0014-spa-only-browser-direct-github-access.md)), the app
is a set of static files. Hosting is undecided and should stay a free choice. Because
the token lives in the browser ([ADR-0016](0016-auth-port-and-token-storage.md)), the
response headers are part of the security model, not a hosting detail.

## Decision

- **The build output is plain static files** (`index.html` plus hashed assets) that
  run on any static host or CDN. The only host requirement is an SPA fallback to
  `index.html` for unknown paths. Runtime configuration is build-time `VITE_*` values.
- **nginx is the reference host.** `apps/web/nginx.conf` serves local development's
  prod-like stack and E2E, and carries the reference security headers that any other
  host must replicate.
- **Security headers:**
  - `Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.github.com;
    img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self';
    font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none';
    form-action 'none'; require-trusted-types-for 'script'; trusted-types ghd-sanitize`
  - The GitHub App exchange URL's origin is added to `connect-src` only when it is
    configured.
  - `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a
    `Permissions-Policy` that denies unused features.
  - No `'unsafe-inline'` and no `'unsafe-eval'` anywhere.
- **Self-hosted fonts and icons.** No third-party origins at runtime besides
  `api.github.com` and `avatars.githubusercontent.com`.
- Docker Compose keeps two profiles: `dev` (Vite) and `prod-like` (nginx serving the
  build). E2E runs against `prod-like`, as ADR-0010 required.

## Consequences

- Any static host works; switching hosts means copying the header config.
- Images in PR content are not loaded (they render as links), so `img-src` stays
  narrow.
- Cost: the CSP must be replicated by hand on each host; a host that cannot set
  headers needs a meta-tag fallback that cannot express `frame-ancestors`.
- Cost: distroless API images, migrations and the `test` compose profile from
  ADR-0010 are gone.

## Alternatives considered

| Option                        | Why not                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Keep ADR-0010 container-first | A container per static site adds nothing over a static host.                   |
| Pick a host now               | No requirement forces one; the build stays portable instead.                   |
| Meta-tag CSP only             | Cannot set `frame-ancestors` or Trusted Types reporting; headers are stronger. |

## Revisit when

A host is chosen that cannot set response headers, or a server-side piece beyond the
token-exchange handler becomes necessary.
