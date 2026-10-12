# Naming and code style

Formatting is not a matter of taste here — `oxfmt` decides, and it is not configurable
beyond ignore patterns. What follows is what a formatter cannot enforce.

## Files

| Kind             | Convention                          | Example                      |
| ---------------- | ----------------------------------- | ---------------------------- |
| React components | PascalCase                          | `TaskItem.tsx`               |
| Everything else  | kebab-case                          | `http-task-api.ts`           |
| Tests            | next to the code, or under `tests/` | `task.test.ts`               |
| Use cases        | `<resource>.usecases.ts`            | `task.usecases.ts`           |
| Adapters         | `<tech>-<port>.ts`                  | `drizzle-task-repository.ts` |
| Schemas          | `<resource>.schema.ts`              | `task.schema.ts`             |

An adapter's filename names the technology on purpose. `drizzle-task-repository.ts`
says exactly what will change if the ORM changes.

## Language rules the compiler enforces

- **No parameter properties.** `erasableSyntaxOnly` is on so Node strips types natively.
  Declare the field, assign it in the constructor.
- **No enums.** Same reason. Use `as const` objects or union types.
- **Import extensions are real.** `./task.ts`, not `./task.js`. TypeScript rewrites them
  on emit, so the source names a file that actually exists.
- **`import type` for types.** Enforced by `verbatimModuleSyntax`.

## Naming

- Booleans read as assertions: `done`, `isPending`, `hasErrors`.
- Functions are verbs: `createTask`, `toProblem`, `buildPath`.
- Ports are capabilities, not implementations: `TaskRepository`, not `PostgresClient`.
- Prefer `left`/`right` in comparators over `a`/`b` — the sort direction becomes
  readable.
- Avoid abbreviations except the universal ones (`id`, `url`, `db`).

## Comments

Comment **why**, not what. The code says what.

```ts
// ✅ Explains a decision the reader cannot infer
// Rehydrate rather than re-create: re-running creation rules would make
// historical rows unloadable the moment a rule tightens.
return Task.restore(snapshot);

// ❌ Restates the code
// Restore the task
return Task.restore(snapshot);
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
