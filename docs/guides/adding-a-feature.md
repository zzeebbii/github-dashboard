# Adding a feature, end to end

The most important document in this repository. It walks the **Task** reference slice layer by layer. Follow it literally for anything new; the pattern is identical every time.

The running example: adding a `dueDate` to tasks.

---

## The order matters

Always work **contract first, then backend inward-out, then frontend**. Doing it in this order means the compiler tells you what is left to do at every step.

```
1. contract  →  2. domain  →  3. application  →  4. infrastructure  →  5. http
                                                                        │
                                              6. frontend port ← ← ← ← ←┘
                                                     ↓
                                        7. hooks → 8. ui → 9. feature
                                                     ↓
                                                 10. tests
```

---

## 1. Change the contract first

`packages/contracts/src/task/task.schema.ts`

```ts
export const TaskSchema = z.object({
  id: TaskIdSchema,
  title: z.string().min(1).max(TASK_TITLE_MAX_LENGTH),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
  dueDate: z.iso.datetime().optional(), // ← added: OPTIONAL, so this is additive
});
```

Then regenerate and commit the published spec:

```bash
pnpm contract:generate
pnpm contract:breaking   # tells you additive vs breaking
```

> **Additive or breaking?** Adding an _optional_ response field is additive. Removing a field, renaming one, narrowing a type, or adding a _required_ request field is breaking — and needs a `feat!:` commit, a `breaking-change` label, and an ADR.

At this point `pnpm typecheck` will fail everywhere the new field must be handled. That is the design working: the contract propagates its own to-do list.

## 2. Domain — the business rule

`apps/api/src/domain/task/task.ts`

Remember: **no imports here at all.** Express the rule with types and constructors.

```ts
export type TaskValidationError =
  | { readonly kind: "TitleEmpty" }
  | { readonly kind: "TitleTooLong"; readonly maxLength: number; readonly actualLength: number }
  | { readonly kind: "DueDateInPast"; readonly dueDate: Date }; // ← new rule

static create(input: { id: TaskId; title: string; createdAt: Date; dueDate?: Date }) {
  // ...existing checks...
  if (input.dueDate !== undefined && input.dueDate < input.createdAt) {
    return err({ kind: "DueDateInPast", dueDate: input.dueDate });
  }
  return ok(new Task({ ...  }));
}
```

Then map the new error kind in `application/errors.ts`. The exhaustive `switch` there means **forgetting to is a compile error**, not a runtime surprise.

## 3. Application — orchestration and ports

`apps/api/src/application/task/task.usecases.ts`

Use cases take dependencies as an argument and return `Result`. They never throw for expected failures and never know about HTTP.

If your feature needs something new from the outside world (an email sender, a queue, a third-party API), **add a port to `application/ports.ts`** — do not import a client here.

## 4. Infrastructure — adapters and persistence

Schema first (`infrastructure/persistence/schema.ts`), then the migration:

```bash
pnpm db:generate     # writes apps/api/drizzle/NNNN_*.sql — review it, then commit it
```

Then update the mapping in `drizzle-task-repository.ts`. This is the only file that knows tasks live in PostgreSQL.

## 5. HTTP — the thin adapter

`apps/api/src/http/task.routes.ts`

Routes do exactly three things: parse against the contract, call a use case, map the result. If you find yourself writing an `if` about business meaning here, it belongs in the domain.

## 6–9. Frontend

| Step       | File                              | Rule                                                                             |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------- |
| 6. Port    | `application/ports.ts`            | Types come from `@kit/contracts`                                                 |
| 7. Adapter | `infrastructure/http-task-api.ts` | The only file that touches the network; validates responses against the contract |
| 8. Hooks   | `application/tasks/use-tasks.ts`  | Depends on the port, never on `fetch`                                            |
| 9. UI      | `ui/` then `features/`            | `ui/` is presentational: props in, JSX out                                       |

## 10. Tests — one per layer that changed

| You changed    | Write                                                  |
| -------------- | ------------------------------------------------------ |
| Domain rule    | Unit test, no mocks (`domain/task/task.test.ts`)       |
| Use case       | Unit test with the in-memory repository                |
| Repository/SQL | Integration test against real Postgres                 |
| Route          | HTTP test via `app.request()`, no server, no DB        |
| Component      | Browser-mode component test with the in-memory API     |
| A user journey | One Playwright test — only if it is genuinely critical |

---

## Finish

```bash
pnpm verify
```

Then check the [Definition of Done](../../AGENTS.md#definition-of-done). If you made an architectural decision, record it:

```bash
pnpm adr:new "Why tasks carry a due date"
```

---

## Adding a whole new resource

Same shape, one directory deeper. For an `Order` resource:

```
packages/contracts/src/order/{order.schema.ts,order.endpoints.ts}   → export from src/index.ts
apps/api/src/domain/order/order.ts
apps/api/src/application/order/order.usecases.ts                    → ports in application/ports.ts
apps/api/src/infrastructure/persistence/{schema.ts,drizzle-order-repository.ts}
apps/api/src/http/order.routes.ts                                   → mount in http/app.ts
                                                                    → wire in http/composition.ts
apps/web/src/{application/orders,ui,features/orders}
```

Copy the Task slice and rename. That is the intended workflow — the reference slice exists to be imitated.
