# Naming and code style

Formatting is not a matter of taste here — `oxfmt` decides, and it is not configurable
beyond ignore patterns. What follows is what a formatter cannot enforce.

## Files

| Kind             | Convention                          | Example                  |
| ---------------- | ----------------------------------- | ------------------------ |
| React components | PascalCase                          | `HomePage.tsx`           |
| Everything else  | kebab-case                          | `pull-request.ts`        |
| Tests            | next to the code, or under `tests/` | `sections.test.ts`       |
| Hooks            | `use-<thing>.ts`                    | `use-home.ts`            |
| Adapters         | `<tech>-<port>.ts`                  | `indexeddb-cache.ts`     |
| Schemas          | `<thing>.schema.ts`                 | `pull-request.schema.ts` |

An adapter's filename names the technology on purpose. `indexeddb-cache.ts` says
exactly what changes if the storage changes.

## Language rules the compiler enforces

- **No parameter properties.** `erasableSyntaxOnly` is on. Declare the field, assign it
  in the constructor.
- **No enums.** Same reason. Use `as const` objects or union types.
- **Import extensions are real.** `./sort.ts`, not `./sort.js`. TypeScript rewrites them
  on emit, so the source names a file that actually exists.
- **`import type` for types.** Enforced by `verbatimModuleSyntax`.

## Naming

- Booleans read as assertions: `isStale`, `isBot`, `hasErrors`.
- Functions are verbs: `placePullRequest`, `sortPullRequests`.
- Ports are capabilities, not implementations: `CachePort`, not `IndexedDbClient`.
- Prefer `left`/`right` in comparators over `a`/`b` — the sort direction becomes
  readable.
- Avoid abbreviations except the universal ones (`id`, `url`, `pr`).

## Comments

Comment **why**, not what. The code says what.

```ts
// ✅ Explains a decision the reader cannot infer
// Compare lowercased: GitHub logins are case-insensitive, but API responses
// keep whatever case the user typed.
return left.toLowerCase() === right.toLowerCase();

// ❌ Restates the code
// Compare the logins
return left.toLowerCase() === right.toLowerCase();
```

Every escape hatch needs a reason:

```ts
// oxlint-disable-next-line no-console -- reason: startup banner, before any logger exists
```

CI rejects a disable comment without `-- reason:`.

## Exports

- Named exports only; no default exports (except where a framework demands one, e.g.
  Vite and Playwright configs).
- Export only what is used elsewhere. `knip` fails the build on unused exports — if
  something is exported "for later", delete it and add it back when later arrives.
