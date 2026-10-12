# Testing

The strategy optimises for **confidence per test**, not test count. A suite that is
green while the application is broken is worse than no suite, because it is trusted.

## The default is: do not mock

| What you are testing | How                                | Where                                   |
| -------------------- | ---------------------------------- | --------------------------------------- |
| Domain rules         | No mocks, no I/O                   | `apps/api/src/domain/**/*.test.ts`      |
| Use cases            | In-memory port implementations     | `apps/api/src/application/**/*.test.ts` |
| HTTP routes          | `app.request()` — no server, no DB | `apps/api/tests/unit/`                  |
| Repository adapters  | Real PostgreSQL (Testcontainers)   | `apps/api/tests/integration/`           |
| React components     | Real Chromium, in-memory API port  | `apps/web/tests/component/`             |
| Pure frontend logic  | jsdom                              | `apps/web/src/**/*.test.ts`             |
| User journeys        | Playwright vs prod-like stack      | `e2e/tests/`                            |

`vi.mock` of an internal module is **banned**. If you want it, you are missing a port —
add the port. That is an architecture signal, not a testing inconvenience.

## Why real dependencies

**Real PostgreSQL, not SQLite.** A repository verified against a different engine tests
almost nothing that matters: dialect, constraints, transaction semantics, `jsonb`, and
timezone handling all differ. Our integration suite caught exactly this class of thing
— that `timestamp with time zone` round-trips an instant unchanged.

**Real browser, not jsdom.** jsdom passes on focus management, scroll, layout, and
`dialog` behaviour that genuinely breaks in a browser. That false confidence is where
agent-written UI bugs hide. jsdom is kept only for pure logic, where a browser is
wasted overhead.

## Determinism

Time and randomness are **ports**, never ambient:

```ts
const deps = {
  tasks: new InMemoryTaskRepository(),
  clock: fixedClock(), // frozen instant
  ids: sequentialIds(), // predictable UUIDs
};

expect(created.value.id).toBe(nthTaskId(1)); // an exact, nameable value
```

No test in this repository freezes global timers. That is a consequence of the
architecture, not of test discipline.

## Coverage

Per layer, not one global number — a single figure is trivially gamed by testing easy
code.

| Layer                       | Threshold | Why                                                |
| --------------------------- | --------- | -------------------------------------------------- |
| `domain/`, `application/`   | 95%       | Pure functions, no I/O. There is no excuse.        |
| `http/`, `infrastructure/`  | 70%       | Thin adapters; integration tests carry the weight. |
| Frontend `ui/`              | 85%       | Cheap to test in browser mode.                     |
| Frontend features/app/infra | 80%       |                                                    |

Excluded: `main.ts`, `composition.ts`, and the Drizzle table definitions — wiring and
declarations with no logic to assert.

## Running things

```bash
pnpm test:unit          # fast; run constantly
pnpm test:component     # real browser
pnpm test:integration   # needs Docker; ~17s including container startup
pnpm stack:prod-like    # then, in another shell:
pnpm test:e2e
```

## Writing a good test here

- Assert on **behaviour a user or caller can observe**, not on internals.
- In component tests use accessible names (`getByRole('button', { name: 'Add task' })`).
  They describe what a user perceives, and they break when the UI genuinely breaks.
- Validate API responses against the **contract schema**, not a hand-written shape —
  then the test fails if the implementation drifts from the published spec.
- One reason to fail per test. If the name needs "and", split it.
