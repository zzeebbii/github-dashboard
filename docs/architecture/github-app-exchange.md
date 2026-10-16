# GitHub App sign-in and the exchange contract

GitHub App sign-in is built in the frontend and disabled until a deployment sets
`VITE_GITHUB_APP_CLIENT_ID` and `VITE_GITHUB_APP_EXCHANGE_URL` (both, see `.env.example`).
This page defines the HTTP contract the exchange handler must implement. The handler itself
is not part of this repository yet; its requirements are in
[ADR-0016](../adr/0016-auth-port-and-token-storage.md).

## Why a handler is needed

- GitHub's token endpoint, `POST https://github.com/login/oauth/access_token`, requires the
  App's client secret for the code exchange and for refreshing, even with PKCE
  ([generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
  [refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)).
  The secret must never be in the frontend: everything there ships to every user.
- That endpoint sends no CORS headers, so a browser cannot read its response anyway. Checked
  on 2026-10-16: a preflight `OPTIONS` with `Origin: https://example.com` gets a `404` with
  no `Access-Control-Allow-Origin`, and a `POST` gets no `Access-Control-*` headers either.

## The flow

1. **Start** (`infrastructure/auth/github-app-auth.ts`, `start()`). The app makes a random
   `state` and PKCE `code_verifier` (32 bytes from `crypto.getRandomValues`, base64url) and
   keeps them, with a timestamp, in `sessionStorage`. It then sends the browser to
   `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`
   (`<origin>/auth/callback`), `state`, `code_challenge` (base64url SHA-256 of the verifier),
   `code_challenge_method=S256` and `scope=offline_access` (asks for an expiring token plus a
   refresh token). GitHub has accepted PKCE for GitHub Apps since July 2025, S256 only
   ([changelog](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)).
2. **Callback** (`/auth/callback`, `features/auth/GitHubAppCallback.tsx`). First, before
   anything else, `code` and `state` are removed from the address bar
   (`history.replaceState`). Then the stored attempt is read and deleted (single use). The
   callback is rejected without any request when `state` is missing, does not match, was
   already used, or is more than 10 minutes old, or when `code` is missing (for example
   `?error=access_denied`).
3. **Exchange.** The app POSTs the code to the exchange URL (below). The access token it
   gets back is then signed in exactly like a pasted token: one `GET /user` and one
   permission probe, by the PAT adapter. `ghu_` tokens are recorded as `tokenType:
   "github-app"`; they have no OAuth scopes, so there is no write-scope warning.
4. **Refresh.** Five minutes before the access token expires (8 hours), the next GitHub
   request first refreshes it through the same exchange URL. A refresh token is single use
   and lasts 6 months. If refreshing fails, a still-valid token keeps working; an expired
   one counts as signed out.

Access and refresh tokens follow the same storage rule (`sessionStorage`, or
`localStorage` with "remember me"); see `infrastructure/auth/token-storage.ts`.

## Contract

One URL, `POST` only, JSON in and JSON out. The frontend sends no cookies
(`credentials: "omit"`) and refuses redirects.

### Code exchange request

```json
{ "code": "…", "code_verifier": "…", "redirect_uri": "https://dashboard.example/auth/callback" }
```

The handler adds `client_id` and the client secret and forwards to GitHub's token endpoint
with `Accept: application/json`.

### Refresh request

```json
{ "grant_type": "refresh_token", "refresh_token": "ghr_…" }
```

The handler adds `client_id` and the client secret, as above.

### Success response (`200`)

GitHub's own response fields, passed through unchanged:

```json
{
  "access_token": "ghu_…",
  "expires_in": 28800,
  "refresh_token": "ghr_…",
  "refresh_token_expires_in": 15897600,
  "token_type": "bearer",
  "scope": ""
}
```

`access_token` is required. The three expiry fields are absent when the App has token
expiry turned off; the app then never refreshes. Other fields are ignored. The response is
validated with Zod before use.

### Errors

- `400` or `401`: GitHub refused the code or refresh token (`bad_verification_code`,
  `bad_refresh_token`, …). GitHub answers these with `200` and an `error` field, so the
  handler must turn them into a `400`.
- Anything else non-`2xx`: the handler failed.

The body of an error is never shown or logged by the frontend, and every message that is
shown goes through `redact()`, which also removes `ghu_` and `ghr_` tokens.

### Handler obligations (from ADR-0016)

- `https` only; CORS allowed only for the app's own origin, `POST` with `Content-Type`.
- Stateless; never logs codes, access tokens or refresh tokens.
- Verifies nothing beyond what GitHub does: GitHub checks `code_verifier` against the
  `code_challenge` and `redirect_uri` against the App's callback URLs.

The exchange URL's origin is added to the CSP `connect-src` by the Docker image's runtime
`VITE_GITHUB_APP_EXCHANGE_URL` build arg ([ADR-0018](../adr/0018-static-host-agnostic-deployment.md));
pass the same value to the build so Vite inlines it.
