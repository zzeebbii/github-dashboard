# Error handling

One convention, chosen once
([ADR-0020](../adr/0020-error-handling-without-an-http-edge.md)). Do not invent a second.

## Two vocabularies, one translation point

```
domain/                  Result<T, E>  — expected failures are VALUES
infrastructure/github/   GitHubError   — the ONLY place status codes and GraphQL errors are read
ui/, features/           render from GitHubError, never from status codes
```

## Domain: Result, not exceptions

Expected failures are part of the return type, so a caller cannot forget one.
Exceptions are only for genuinely exceptional conditions (a bug).

## GitHub errors: one union

The GitHub adapter maps every failure, once, to a transport-agnostic union:

| Kind             | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `unauthorized`   | 401. Signs out only the affected account.                         |
| `forbidden`      | 403 that is not a rate limit                                      |
| `orgAccess`      | SSO or fine-grained approval needed; carries org, reason, fix URL |
| `rateLimited`    | Primary rate limit used up                                        |
| `secondaryLimit` | 403/429 with `retry-after`; pauses that account                   |
| `network`        | Offline or the request failed                                     |
| `schema`         | The response failed Zod validation                                |
| `notFound`       | 404                                                               |

The mapping prefers GraphQL error `type` and falls back to message text. A GitHub API
change is absorbed in that one file.

## Rules

- **Never leak a token.** No token, header or credential URL in a message, log or UI
  string ([ADR-0016](../adr/0016-auth-port-and-token-storage.md)).
- **Keep partial results.** If a GraphQL query fails for some repositories, render the
  rest and flag the failed ones in place.
- **Never a blank screen.** Offline and storage failures fall back to cached data with
  a visible banner.
- **Exhaustive switches.** A `switch` over an error union ends with
  `const unhandled: never = error;`, so a new kind without handling is a compile error.
- Never `catch` without either handling or rethrowing with context. A caught error is
  `unknown`; narrow it before use.
