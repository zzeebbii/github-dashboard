# Dependency rules

The architecture contract for the browser app ([ADR-0015](../adr/0015-frontend-hexagonal-layering.md)).
`.dependency-cruiser.cjs` and `.oxlintrc.json` are the machine-readable version of this
document; if they ever disagree with it, the config wins and this file is a bug.

## The rules

```
apps/web/src/
  domain/          → nothing framework-shaped: no React, TanStack or Zod
  application/     → domain                      (defines ports; never imports infrastructure)
  infrastructure/  → domain, application         (the ONLY network and storage access)
  ui/              → domain                      (presentational; never features or infrastructure)
  features/        → application, ui, domain
  config/env.ts    → the only reader of import.meta.env
```

| Rule                                                                                         | Tool               | What it forbids                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-domain-is-pure`                                                                         | dependency-cruiser | `domain/` importing `react`, `react-dom` or `@tanstack/*`                                                                                                                                          |
| `web-domain-no-zod`                                                                          | dependency-cruiser | `domain/` importing `zod`                                                                                                                                                                          |
| `web-application-no-infrastructure`                                                          | dependency-cruiser | `application/` importing `infrastructure/`                                                                                                                                                         |
| `web-ui-is-presentational`                                                                   | dependency-cruiser | `ui/` importing `features/` or `infrastructure/`                                                                                                                                                   |
| `web-no-direct-fetch`                                                                        | dependency-cruiser | `domain/`, `application/`, `ui/` importing an HTTP client package (`axios`, `ky`, `openapi-fetch`)                                                                                                 |
| `no-restricted-globals`                                                                      | oxlint             | `fetch`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, `BroadcastChannel` outside `infrastructure/`; `process` everywhere                                                       |
| `no-restricted-properties`                                                                   | oxlint             | `navigator.locks` and `window.`/`globalThis.` access to the names above outside `infrastructure/`; raw-HTML sinks (`.innerHTML`, `.outerHTML`, `.insertAdjacentHTML`, `document.write`) everywhere |
| `react/no-danger`                                                                            | oxlint             | `dangerouslySetInnerHTML` everywhere except `ui/SafeHtml.tsx`                                                                                                                                      |
| `no-eval`, `no-new-func`, `typescript/no-implied-eval`                                       | oxlint             | `eval(...)`, `new Function(...)` and `setTimeout`/`setInterval` with a code string, everywhere                                                                                                     |
| `no-circular`, `no-orphans`, `not-to-unresolvable`, `no-dev-dep-in-src`, `not-to-deprecated` | dependency-cruiser | General hygiene: cycles, dead modules, unresolvable imports, devDependencies in `src`, deprecated packages                                                                                         |

`pnpm audit --prod --audit-level high` also runs in `verify:static`: a high or critical
advisory in a production dependency fails the gate.

## Why each rule exists

### `domain/` imports nothing framework-shaped

The domain is the PR logic: section rules, re-review, activity, staleness, sort keys. If
it imports React, TanStack or Zod, those rules become tied to that library's lifecycle,
and domain tests stop being setup-free.

Zod is singled out because it is the most tempting: it is already a dependency, and it
looks like "just validation". It guards the GitHub boundary in `infrastructure/`. Domain
invariants use branded types and factory functions returning `Result`.

### `application/` defines ports but never imports adapters

The application says _"I need something that can read pull requests"_ (a port);
infrastructure says _"I can do that with GitHub GraphQL"_ (an adapter). Only the
composition root knows both. Hooks and components are then tested against in-memory
port fakes, with no network and no mocking framework.

### Only `infrastructure/` touches the network or browser storage

The browser holds the GitHub token, so this is a security boundary, not a style rule.
If only one directory can call `fetch` or read storage, only one directory can read or
send the token, and that is where review attention goes.

### Raw HTML only through one sanitising component

`dangerouslySetInnerHTML`, `innerHTML` and its siblings, `eval` and `new Function` are how untrusted text
(a PR body, a comment) becomes running script. All rendered HTML goes through
`ui/SafeHtml.tsx`, which sanitises it with DOMPurify under the single
`ghd-sanitize` Trusted Types policy. The other HTML sinks and string evaluation have no
exemption at all, not even in `infrastructure/`.

## How the rules are enforced

Four independent layers, because a single mechanism gets worked around:

| Layer | Mechanism                     | When you find out                           |
| ----- | ----------------------------- | ------------------------------------------- |
| 1     | TypeScript project references | Compile time                                |
| 2     | `dependency-cruiser`          | `pnpm arch:check`, blocking in CI           |
| 3     | `oxlint` restriction rules    | In the editor, `pnpm lint`, and pre-commit  |
| 4     | pnpm strict `node_modules`    | Install time: no phantom transitive imports |

`pnpm verify:guardrails` breaks each rule on purpose and checks that the right check
fails, naming the right rule. A guardrail never observed failing is not known to work.

Run them yourself:

```bash
pnpm arch:check          # dependency-cruiser rules
pnpm lint                # oxlint rules
pnpm verify:guardrails   # prove every rule fires
pnpm arch:graph          # writes a dependency graph to artifacts/
```

## When a rule blocks you

It is usually telling you something true. In order of likelihood:

1. **The code is in the wrong layer.** A `fetch` call in a hook; a business rule in a
   component. Move it.
2. **A port is missing.** You want to call something concrete from `application/`.
   Declare the interface there, implement it in `infrastructure/`, and wire it in at
   the composition root.
3. **The rule is genuinely wrong.** Rare, but possible. Propose an ADR explaining why,
   and change the config deliberately. It is CODEOWNERS-protected, so a human reviews
   it.

What not to do: add an ignore pattern, weaken a rule to `warn`, or route the import
through an intermediate file to dodge the matcher. All three convert a loud, cheap
failure into a silent, expensive one.
