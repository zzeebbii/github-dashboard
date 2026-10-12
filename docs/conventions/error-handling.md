# Error handling

One convention, chosen once (ADR-0009). Do not invent a second.

## Two vocabularies, one translation point

```
domain/        Result<T, E>  — expected failures are VALUES
application/   AppError      — transport-agnostic; never mentions status codes
http/          RFC 9457      — the ONLY place status codes appear
```

## Domain: Result, not exceptions

```ts
static create(input): Result<Task, TaskValidationError> {
  if (title.length === 0) return err({ kind: "TitleEmpty" });
  return ok(new Task({ ... }));
}
```

Expected failures appear in the type signature, so a caller cannot forget one — the
compiler makes them unwrap the `Result`. Exceptions are reserved for genuinely
exceptional conditions (a dead database, a bug).

## Application: a transport-agnostic vocabulary

```ts
export type AppError =
  | { kind: "NotFound"; resource: string; id: string }
  | { kind: "Validation"; issues: readonly ValidationIssue[] }
  | { kind: "Conflict"; reason: string };
```

Nothing here knows what a 404 is. That is why swapping HTTP for a queue would replace
one file.

## HTTP: RFC 9457 problem details

```json
{
  "type": "https://kit.example/problems/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "The request body or parameters did not satisfy the API contract.",
  "errors": [{ "pointer": "/title", "message": "Title must not be empty." }]
}
```

`errors[]` carries JSON Pointers so the frontend can attach messages to the right
input. The shape is defined once, in `packages/contracts/src/problem.ts`, so client and
server cannot disagree about it.

## Exhaustiveness

Every mapping switch ends with:

```ts
default: {
  const unhandled: never = error;
  throw new Error(`Unhandled AppError: ${JSON.stringify(unhandled)}`);
}
```

Adding an error kind without mapping it is then a **compile error**, not a runtime
surprise in production.

## Rules

- Never leak internal messages or stack traces to clients. The 500 handler logs the
  cause and returns a body containing nothing sensitive.
- Never `catch` without either handling or rethrowing with context.
- A caught error is `unknown` (`useUnknownInCatchVariables`). Narrow it before use.
- Adding a new error kind: extend `AppError`, map it in `http/problem.ts`, add the
  status to `ProblemStatus`. The compiler will point at each place.
