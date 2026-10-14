# ADR-0016: Auth port and token storage

**Status:** Accepted
**Date:** 2026-10-13

## Context

The browser calls GitHub with a user's token ([ADR-0014](0014-spa-only-browser-direct-github-access.md)).
Users need two ways to sign in: a personal access token (PAT) they paste, and a
GitHub App sign-in. Several GitHub accounts (work and personal) must be usable side
by side. GitHub App user tokens expire after 8 hours and are refreshed with a
refresh token. Both the code exchange and the refresh need the app's client secret,
and GitHub's token endpoint does not allow cross-origin calls.

## Decision

**One port, two adapters.** `AuthPort` in `application/` (`signIn`, `refresh`,
`signOut`, `currentToken(accountId)`) with `PatAuth` and `GitHubAppAuth` in
`infrastructure/auth/`.

- **PAT first.** A pasted token is accepted only after one `GET /user` returns 200.
  Classic vs fine-grained, scopes and expiry come from that response's headers.
- **GitHub App behind placeholder config.** `VITE_GITHUB_APP_CLIENT_ID` and
  `VITE_GITHUB_APP_EXCHANGE_URL` are empty by default; the sign-in button is then
  disabled with an explanation. When both are set, the web flow uses `state` (single
  use, at most 10 minutes old) and PKCE (S256), strips `code` and `state` from the
  URL before any other work, and requires an `https` exchange URL
  (`http://localhost` in development).

**Tokens go only to `api.github.com`.** When the GitHub App is enabled, the code
exchange and token refresh also go to the exchange handler, which stores nothing.

**Storage.** Per account, a "remember me" choice, off by default:

| Remember me | Access and refresh tokens | Non-secret account data (login, avatar, favourites, preferences) |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| off         | `sessionStorage`          | `localStorage` / IndexedDB                                       |
| on          | `localStorage`            | `localStorage` / IndexedDB                                       |

All stored and cached data is namespaced by account id. For an account with
"remember me" off, cached GitHub data is purged at startup when no session token
exists, so private-repo content does not outlive the session that could read it.
Removing an account deletes its token and data; "sign out of everything" clears all
app storage. A 401 signs out only the affected account.

Tokens never appear in logs, error messages, URLs or the IndexedDB cache.

**Accepted residual risk.** Any script that runs in the page can read Web Storage, so
a successful XSS can steal tokens. We accept this for a personal tool and reduce the
chance of XSS instead: a strict CSP with Trusted Types ([ADR-0018](0018-static-host-agnostic-deployment.md)),
lint bans on raw-HTML APIs, one sanitising component for GitHub-rendered HTML, no
third-party scripts, and `sessionStorage` as the default.

**Requirements for the future exchange handler** (not built yet):

- holds the client secret server-side only; the frontend never sees it;
- accepts cross-origin requests only from the app's own origin;
- never logs codes, access tokens or refresh tokens;
- is stateless: no database, no session store;
- serves `https` only;
- is a plain HTTP handler (POST in, JSON out) so it can run on any serverless or
  container platform.

## Consequences

- Sign-in works today with a PAT and no server at all.
- Enabling GitHub App sign-in later needs config plus one small handler, no UI work.
- Multiple accounts cannot leak data into each other's views by construction.
- Cost: users with "remember me" off sign in again in every new browser session.
- Cost: XSS remains the deciding risk; every HTML-rendering change needs scrutiny.

## Alternatives considered

| Option                                  | Why not                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Backend session with an httpOnly cookie | Requires an application backend, which ADR-0014 removes.                      |
| Encrypt the token in IndexedDB          | The key must also live in the page, so it adds no protection against XSS.     |
| GitHub device flow                      | GitHub's device-flow endpoints do not allow cross-origin calls either.        |
| PAT only, no GitHub App                 | Fine-grained, revocable app access is a stated requirement for a later phase. |

## Revisit when

The app is used by other people on shared machines, or a browser storage primitive
appears that page scripts cannot read.
