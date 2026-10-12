# Dependency rules

The architecture contract. `.dependency-cruiser.cjs` is the machine-readable version of
this document; if the two ever disagree, the config wins and this file is a bug.

## The rules

```
apps/api/src/
  domain/          → imports NOTHING
  application/     → domain
  infrastructure/  → domain, application
  http/            → domain, application, infrastructure
  config/env.ts    → the ONLY reader of process.env

apps/web/src/
  domain/          → nothing framework-shaped
  application/     → domain, @kit/contracts
  infrastructure/  → domain, application, @kit/contracts   (only network access)
  ui/              → domain, @kit/contracts                 (no fetching)
  features/        → application, ui, domain

packages/contracts → zod. Nothing else. Ever.

apps/web  ⇸  apps/api      (forbidden, both directions)
```

## Why each rule exists

### `domain/` imports nothing

Not Zod, not Hono, not `node:crypto`. The moment the domain imports something, the
business rules become tied to that thing's lifecycle. Keeping it empty means the rules
survive replacing the framework, the ORM, the runtime, and the validation library.

It also makes domain tests trivial: no setup, no mocks, no I/O, microseconds to run.

### `application/` defines ports but never imports adapters

This is the dependency inversion that carries the whole design. The application says
_"I need something that can save a Task"_; infrastructure says _"I can do that with
Drizzle"_; `http/composition.ts` introduces them. Nothing else knows both sides.

Practical consequence: use cases are tested against a real in-memory repository, so
those tests need no mocking framework at all.

### `packages/contracts` may import only Zod

This is the single rule most likely to be eroded, and the one that matters most.

The contracts package is why the backend can be replaced. If it grows a dependency on
an app, it stops being a contract and becomes shared code — and the two apps become
coupled through it. If it grows implementation, a non-TypeScript backend can no longer
satisfy it.

It will be under constant pressure to absorb "just one small helper". Put the helper in
whichever app needs it, **even if both do**. Duplication across the boundary is cheaper
than coupling across it.

### `apps/web` never imports `apps/api`

The honest test of this design: **delete `apps/api` entirely, and the frontend,
contracts, and E2E suite still typecheck and describe a complete system.**

If any TypeScript import crosses that line, replacing the backend stops being a
deployment change and becomes a refactor.

### `process.env` only in `config/env.ts`

Configuration read at the point of use is configuration that fails at 3am on the one
code path nobody tested. Parsing once at startup, through Zod, means a misconfigured
deploy dies immediately with a message naming the variable.

## How the rules are enforced

Four independent layers, because a single mechanism gets worked around:

| Layer | Mechanism                      | When you find out                                       |
| ----- | ------------------------------ | ------------------------------------------------------- |
| 1     | TypeScript project references  | Compile time — `domain` cannot resolve `infrastructure` |
| 2     | `dependency-cruiser`           | `pnpm arch:check`, blocking in CI                       |
| 3     | `oxlint no-restricted-imports` | In the editor, and pre-commit                           |
| 4     | pnpm strict `node_modules`     | Install time — no phantom transitive imports            |

Run them yourself:

```bash
pnpm arch:check     # the rules
pnpm arch:graph     # writes a dependency graph to artifacts/
```

## When a rule blocks you

It is usually telling you something true. In order of likelihood:

1. **The code is in the wrong layer.** A business rule in `http/`; a fetch call in a
   component. Move it.
2. **A port is missing.** You want to call something concrete from `application/`.
   Declare the interface there, implement it in `infrastructure/`, bind it in
   `composition.ts`.
3. **The rule is genuinely wrong.** Rare, but possible. Propose an ADR explaining why,
   and change `.dependency-cruiser.cjs` deliberately. It is CODEOWNERS-protected, so a
   human reviews it.

What not to do: add an ignore pattern, weaken a rule to `warn`, or route the import
through an intermediate file to dodge the matcher. All three convert a loud, cheap
failure into a silent, expensive one.
