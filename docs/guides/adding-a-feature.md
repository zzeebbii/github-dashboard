# Adding a feature, end to end

Follow this order for anything new. The layers are in
[ADR-0015](../adr/0015-frontend-hexagonal-layering.md); the rules that enforce them are
in [dependency-rules.md](../conventions/dependency-rules.md).

The running example: show a "stale" badge on PRs with no activity for a while.

---

## The order matters

Work **inside out**: the rule first, then the data, then the screen. The compiler then
tells you what is left at every step.

```
1. domain  →  2. port  →  3. adapter  →  4. hook  →  5. ui  →  6. feature  →  7. tests
```

Skip a step when the change does not need it. A pure rule change may stop at step 1.

---

## 1. Domain — the rule

`apps/web/src/domain/`

Pure functions over the plain types in `pull-request.ts`. **No imports from outside
`domain/`**: not Zod, not React, not browser APIs. Time is passed in, never read.

```ts
export function isStale(pr: PullRequest, now: Date): boolean {
  // ...
}
```

Add a unit test next to it (`activity.test.ts`). No mocks.

## 2. Port — only if you need something new from outside

`apps/web/src/application/`

If the feature needs data or a browser capability that no port offers yet, add a
method to an existing port (`GitHubReadPort`, `CachePort`, ...) or a new port. A port is
a TypeScript interface. It never imports `infrastructure/`.

## 3. Adapter — the only place that touches the outside

`apps/web/src/infrastructure/`

- GitHub: a static GraphQL document with typed variables (never build a query from
  user input), a Zod schema for the response, and a mapping onto domain types. Map
  failures to `GitHubError` ([error-handling.md](../conventions/error-handling.md)).
- Keep the quota budget: batch list data into one query, send ETags on REST calls
  ([ADR-0017](../adr/0017-indexeddb-cache-and-quota-budget.md)).
- Storage: namespace every key by account id. Never store a token in IndexedDB.

## 4. Hook — server state

`apps/web/src/application/use-*.ts`

A TanStack Query hook that calls the port, not `fetch`.

## 5. UI — presentational

`apps/web/src/ui/`

Props in, JSX out. No data fetching. Every visible string comes from the message
catalogue (en, fi, sv). Status is icon plus text, never colour alone. Real `<button>`
and `<a href>` elements ([ADR-0021](../adr/0021-i18n-themes-and-accessibility.md)).

## 6. Feature — composition

`apps/web/src/features/<name>/`

Calls the hooks and passes data to `ui/` components. Add a route in `routes/` if it is
a new screen.

## 7. Tests — one per layer that changed

| You changed     | Write                                                      |
| --------------- | ---------------------------------------------------------- |
| Domain rule     | Unit test, no mocks (`src/domain/*.test.ts`)               |
| GitHub adapter  | MSW test with recorded fixtures; budget assertion          |
| Storage adapter | Browser-mode test against the real API                     |
| Component       | Browser-mode test with in-memory ports, axe in both themes |
| A user journey  | One Playwright test — only if it is genuinely critical     |

See [testing.md](testing.md).

---

## Finish

```bash
pnpm verify
```

Then check the [Definition of Done](../../AGENTS.md#definition-of-done). If you made an
architectural decision, record it:

```bash
pnpm adr:new "Why stale PRs get a badge"
```
