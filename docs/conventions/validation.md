# Validation

TypeScript types vanish at runtime. Anything crossing a trust boundary is validated;
anything inside the core is made unrepresentable instead.

## Where each schema lives

| Concern                   | Lives in                   | Validated                                      |
| ------------------------- | -------------------------- | ---------------------------------------------- |
| API request / response    | `packages/contracts`       | Backend on the way in, frontend on the way out |
| Environment variables     | `apps/*/src/config/env.ts` | Process start — **fail fast**                  |
| Third-party API responses | The infrastructure adapter | At the adapter boundary                        |
| Database rows             | The repository adapter     | On read, if the schema is not ours             |
| **Domain invariants**     | **NOT Zod**                | At construction                                |

## Zod guards boundaries; the type system guards the core

This is the distinction people get wrong most often.

```ts
// ✅ Boundary — the wire is untrusted, so parse it
const body = CreateTaskSchema.safeParse(await c.req.json());

// ✅ Core — make the invalid state unconstructible
export function toTaskId(value: string): TaskId { ... }
const result = Task.create({ id, title, createdAt }); // Result<Task, Error>

// ❌ Never — domain/ must not import Zod
import { z } from "zod";
```

A `Task` that exists is valid, because `Task.create` is the only way to make one and it
returns a `Result`. There is nothing to re-validate later.

## Environment variables fail fast

```ts
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration:\n${details}`);
export const env = Object.freeze(parsed.data);
```

Parsed once, at startup, in the one file allowed to read `process.env`. A misconfigured
deploy dies immediately with the variable named, instead of failing later on whichever
request happens to touch it.

## The frontend validates responses too

The API is trusted, but "trusted" is not "correct" — versions skew, proxies interfere,
deploys race. `http-task-api.ts` parses every response against the contract, so drift
fails loudly at the boundary rather than as a confusing render error three components
away.

## Rules

- Prefer `safeParse` at boundaries; reserve `parse` for cases where throwing is right
  (fixtures, startup).
- Never `as` your way past a parse. If you are casting, you skipped a boundary.
- Query and path parameters arrive as strings — the contract coerces them, so consumers
  get real types.
- Keep contract schemas free of business rules that belong in the domain. "A title is
  1–200 characters" is a wire constraint; "a task cannot be due before it was created"
  is a domain rule.
