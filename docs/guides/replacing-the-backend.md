# Replacing the backend

This repository is arranged so the TypeScript API can be replaced by .NET, Java, Go, or
a managed platform without touching the frontend. This is the procedure.

## What the frontend actually depends on

Only two things:

1. **`artifacts/openapi.json`** — the committed, language-neutral contract.
2. **The HTTP wire** at that contract's paths.

There is no TypeScript import from `apps/web` to `apps/api`. `dependency-cruiser`
forbids it in both directions, so this is guaranteed rather than hoped for.

The honest test: **delete `apps/api` and the frontend, contracts, and E2E suite still
typecheck and describe a complete system.** Try it — that is what makes this real.

## Procedure

**1. Take the contract as the specification.**

`artifacts/openapi.json` is OpenAPI 3.1. Generate server stubs in the target language
with the standard generator for that ecosystem. The new backend never needs
`packages/contracts`.

**2. Reimplement the layers you actually care about.**

The hexagonal split maps directly onto any language:

| This repo         | Equivalent elsewhere                               |
| ----------------- | -------------------------------------------------- |
| `domain/`         | Domain model. Port it — this is the valuable part. |
| `application/`    | Use cases / application services                   |
| `infrastructure/` | Repositories, adapters                             |
| `http/`           | Controllers / handlers                             |

The domain layer imports nothing, so it is a direct translation rather than an
untangling exercise.

**3. Keep the same database, or migrate it.**

Migrations live in `apps/api/drizzle/*.sql` as plain SQL. They are portable — run them
with whatever migration tool the new stack uses.

**4. Make the E2E suite pass.**

`e2e/tests/` targets the HTTP contract and user-visible behaviour, never
implementation. It therefore survives the rewrite and becomes the **acceptance suite
for the replacement**. When it goes green against the new backend, you are done.

**5. Point the stack at it.**

Replace the `api` service in `compose.yaml`. `apps/web` needs no change at all: nginx
proxies `/api` to whatever answers on that hostname.

## What you must preserve

- Every path, method, status code, and field in `artifacts/openapi.json`.
- RFC 9457 `application/problem+json` error bodies, including the `errors[]` array with
  JSON Pointers — the frontend renders field-level errors from it.
- `GET /health/live` and `GET /health/ready`.
- Timestamps as RFC 3339 UTC strings.

## Keeping the contract honest afterwards

Once the backend is not TypeScript, `packages/contracts` is no longer generated from
the implementation, so drift becomes possible again. Two options:

- Publish `@kit/contracts` and keep it as the shared source of truth, with the new
  backend generating its stubs from the emitted spec in CI; or
- Make the new backend the source of truth, emit OpenAPI from it, and generate the
  frontend's types from that instead.

Either works. What must not happen is two hand-maintained definitions.
