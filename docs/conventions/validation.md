# Validation

TypeScript types vanish at runtime. Anything crossing a trust boundary is validated;
anything inside the core is made correct by construction instead.

## Where each schema lives

| Concern                | Lives in                              | Validated                         |
| ---------------------- | ------------------------------------- | --------------------------------- |
| GitHub API responses   | `apps/web/src/infrastructure/github/` | On every response, before mapping |
| Cached / stored data   | The storage adapter                   | On read                           |
| Build-time environment | `apps/web/src/config/env.ts`          | At app load — **fail fast**       |
| **Domain rules**       | **NOT Zod**                           | By construction                   |

## Zod guards boundaries; the type system guards the core

```ts
// ✅ Boundary — GitHub's response is untrusted, so parse it
const parsed = PullRequestNodeSchema.safeParse(json);

// ✅ Core — plain types, pure functions; "now" is passed in
export function placePullRequest(pr: PullRequest, viewer: Viewer): Placement | null;

// ❌ Never — domain/ must not import Zod
import { z } from "zod";
```

The adapter parses, then maps onto the plain types in `domain/pull-request.ts`. Domain
code only ever sees data that already passed validation. A parse failure becomes a
`schema` error ([error-handling.md](error-handling.md)), never a crash.

## Environment variables fail fast

`config/env.ts` parses `import.meta.env` once, at load. A misconfigured build fails
immediately with the variable named. Every `VITE_*` value ships to the browser, so
never put a secret there.

## Rules

- Prefer `safeParse` at boundaries; reserve `parse` for cases where throwing is right
  (fixtures, startup).
- Never `as` your way past a parse. If you are casting, you skipped a boundary.
- Keep schemas to GitHub's shape. Business meaning ("needs my review") belongs in the
  domain.
