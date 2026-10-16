# Scope Spec: GitHub Dashboard

Source pitch: `.claude/ideas/github-dashboard.md` (Framed Idea + Requirements + Dependency Analysis + Spec Review). BR-n references point to that document's Business Requirements.

## Technical approach

_Provisional — rests on ADRs 0014–0021, written and accepted in Scope 0. Until then existing ADRs 0002, 0004, 0006, 0010 are Accepted and contradicted._

- **SPA only, browser-direct GitHub access.** No own backend in phase 1. `apps/api`, `packages/contracts`, `artifacts/openapi.json` are removed. A later, stateless GitHub App token-exchange/refresh HTTP handler is the only server-side piece ever planned.
- **Frontend hexagonal layering in `apps/web/src`:**
  - `domain/` — pure PR logic (section rules, re-requested, stale, "+N new", sorting keys). No Zod, React or TanStack.
  - `application/` — ports (`AuthPort`, `GitHubReadPort`, `CachePort`, `AccountStore`, `PreferencesStore`, `CrossTabPort`) and TanStack Query hooks.
  - `infrastructure/` — GitHub GraphQL/REST adapter (Zod-validated responses), auth adapters (PAT, GitHub App), IndexedDB cache, Web Locks + BroadcastChannel cross-tab adapter. The **only** layer that calls `fetch` or touches storage APIs.
  - `ui/` presentational; `features/` composes application + ui; `config/env.ts` the only reader of `import.meta.env`.
- **Reuse:** `application/api-provider.tsx` context-port pattern; error mapping in `infrastructure/http-task-api.ts`; `config/env.ts` validation; `main.tsx` composition root; code-based routes (ADR 0003); `tests/render.tsx`; `apps/web/nginx.conf`; web dependency-cruiser rules; `pnpm verify` tooling.
- **ADRs:** supersede 0002, 0004, 0006, 0010; amend 0001, 0005, 0008, 0009, 0012; keep 0003, 0007, 0011, 0013.
- **Testing:** domain/application with in-memory port fakes; component tests in real Chromium with axe; infrastructure adapters against MSW (Node) with recorded GitHub fixtures; IndexedDB adapter against real browser IndexedDB; E2E on the nginx prod-like stack with GitHub mocked by Playwright `page.route` (production CSP unchanged).

## Delivery order

Scope 0 → (Scope 1 ∥ Scope 2) → Scope 3 → (Scope 4 ∥ Scope 5) → (Scope 6 ∥ Scope 7) → Scope Final. Every PR leaves `pnpm verify` green.

---

## Scope 0: Decisions and Template Teardown

Turn the starter template into an empty, green SPA shell with the new architecture recorded and enforced.

### Functional Requirements

- **FR-0.1** Write ADRs 0014–0021 via `pnpm adr:new`: (0014) SPA-only browser-direct GitHub access — supersedes 0002, 0004, 0006; (0015) frontend hexagonal layering with Zod at the GitHub adapter boundary — amends 0005; (0016) auth port, PAT first, GitHub App behind placeholder config, token storage; it records the accepted residual risk that any XSS can read tokens from Web Storage, and the requirements for the future exchange handler: client secret only server-side, CORS restricted to the app origin, no logging of codes or tokens, stateless, `https` only; (0017) versioned IndexedDB cache, cache-first refresh and quota budget; (0018) host-agnostic static deployment with strict CSP — supersedes 0010; (0019) testing for a browser-only app — amends 0008; (0020) error handling without an HTTP edge — replaces the problem+json half of 0009; (0021) i18n, themes and accessibility baseline. Mark superseded/amended ADRs accordingly and update `docs/adr/README.md`.
- **FR-0.2** Delete `apps/api`, `packages/contracts`, `artifacts/openapi.json`, the Tasks feature in `apps/web` (`features/tasks`, `ui/TaskForm.tsx`, `ui/TaskItem.tsx`, `infrastructure/http-task-api*`, `application/tasks`, related tests and fakes), and `e2e/tests/tasks.spec.ts`.
- **FR-0.3** Remove contract/migration/Postgres tooling: root scripts `contract:*`, `db:*`, `verify:contract-only`, `test:integration`; `scripts/check-contract-drift.mjs`, `scripts/check-breaking-changes.mjs`; compose `db`, `migrate`, `api-*` services; CI jobs `contract-drift`, `test-integration`, `contract-breaking`; the `/api` and `/health` proxy blocks in nginx.
- **FR-0.4** Rewrite `.dependency-cruiser.cjs`: drop API and contracts rules; keep the web rules; add `web-application-no-infrastructure` (application never imports infrastructure) and keep `no-circular`/`no-orphans`.
- **FR-0.5** Add an oxlint rule (`no-restricted-globals` / `no-restricted-syntax`) forbidding `fetch`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `indexedDB`, `BroadcastChannel` and `navigator.locks` outside `apps/web/src/infrastructure/`.
- **FR-0.13** _(security)_ Add an oxlint rule forbidding `dangerouslySetInnerHTML`, `innerHTML` and `eval`/`new Function` everywhere except the single sanitised-HTML component in `ui/` (FR-6.6); add `pnpm audit --prod --audit-level high` to `verify:static`.
- **FR-0.6** Rewrite `packages/testing` to have no `@kit/contracts` dependency (determinism helpers kept; GitHub fixture factories added in Scope 3), or delete it if nothing uses it after teardown.
- **FR-0.7** Update `scripts/verify-guardrails.mjs` so every remaining guardrail (including FR-0.4 and FR-0.5) is proven to fire, and remove cases for deleted guardrails. Update `knip.json`, `.syncpackrc.json`, `scripts/preflight.mjs`, `scripts/init-project.mjs` and `.env.example` for the new layout.
- **FR-0.8** nginx serves the SPA with an SPA fallback and the reference security headers: CSP `default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` denying unused features. The CSP also sets `require-trusted-types-for 'script'` and a single `trusted-types` policy used only by the HTML sanitiser (FR-6.6). CSP is generated so `VITE_GITHUB_APP_EXCHANGE_URL`'s origin is added to `connect-src` only when set.
- **FR-0.9** compose has `dev` (Vite) and `prod-like` (nginx serving the build) profiles only; CI e2e waits on the nginx root instead of `/health/ready`.
- **FR-0.10** Rewrite `AGENTS.md`/`CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `docs/architecture/overview.md`, `docs/conventions/*`, `docs/guides/*` for the SPA architecture; delete `docs/guides/replacing-the-backend.md`; replace the Definition of Done's contract items with quota-budget, i18n-key and axe items. Set real CODEOWNERS owners.
- **FR-0.11** Rename the workspace package scope from the template name (`agentic-fullstack-starter-kit`, `@kit/*`) to `github-dashboard` / `@ghd/*`.
- **FR-0.12** `apps/web` renders a minimal placeholder home route so build, component and E2E smoke tests have something to exercise.

### Acceptance Criteria

- **AC-0.1** `pnpm verify` passes on a clean checkout with no Docker daemon running.
- **AC-0.2** `pnpm verify:guardrails` passes, and introducing a `fetch(` call in `apps/web/src/features/` makes `pnpm lint` fail.
- **AC-0.3** `rg -n "@kit/contracts|apps/api|drizzle|postgres|openapi\.json" --glob '!docs/adr/**' --glob '!docs/pr-dashboard-designs/**' --glob '!CHANGELOG.md'` returns no matches.
- **AC-0.4** `docker compose --profile prod-like up` serves the placeholder page on `http://localhost:8080`, and its response carries the FR-0.8 headers; `curl http://localhost:8080/some/deep/link` returns `index.html`.
- **AC-0.5** ADRs 0014–0021 exist with status Accepted; 0002, 0004, 0006, 0010 are marked Superseded with links to their successors.
- **AC-0.6** `knip` reports no unused files, exports or dependencies.
- **AC-0.7** _(security)_ Adding `dangerouslySetInnerHTML` in a `features/` file makes `pnpm lint` fail; the prod-like response carries `require-trusted-types-for 'script'`.

---

## Scope 1: App Shell and Web Standards

Layout, theming, i18n, routing and accessibility baseline per the Claude Design file, with no GitHub data yet.

### Functional Requirements

- **FR-1.1** Port the design tokens from `docs/pr-dashboard-designs/PR Dashboard.dc.html` (`:root` light, `html.dark` dark) into `apps/web/src/styles.css` as CSS custom properties.
- **FR-1.2** Self-host Geist and Geist Mono (woff2, `font-display: swap`) and Lucide icons (as an installed package rendering inline SVG components, not the CDN icon font). No runtime request leaves the origin except to api.github.com and avatars.githubusercontent.com.
- **FR-1.3** Theme: light / dark / system (default system, follows `prefers-color-scheme` live). A header quick toggle switches light↔dark; Settings offers all three. Persisted in `PreferencesStore`. The theme is applied before first paint (no flash).
- **FR-1.4** i18n: a typed message catalogue with English as the source; Finnish and Swedish catalogues seeded from the design's `L` table. Runtime language switch without reload; `<html lang>` updated; English fallback for a missing key; `Intl.RelativeTimeFormat` / `Intl.NumberFormat` / `Intl.DateTimeFormat` in the active language. No i18n library unless the catalogue needs plurals beyond `Intl.PluralRules`.
- **FR-1.5** A `pnpm i18n:check` script (wired into `verify:static`) fails when fi or sv lacks a key present in en, or has a key en lacks.
- **FR-1.6** Routes: `/` (Home), `/repo/$owner/$name` (repo page), and a `pull` search param or nested route `/repo/$owner/$name/pull/$number` that opens the detail panel over the current view. Browser Back closes the panel / returns to the previous view.
- **FR-1.7** Shell layout per the design: collapsible sidebar (account menu, Home, Favourites, Repositories, Settings, language), header (breadcrumbs, search trigger, quota indicator slot, last-updated slot, refresh button, theme toggle), main content. Sidebar collapses to a drawer below 768 px; layout works at 320 px with no horizontal page scroll.
- **FR-1.8** Density preference (comfortable / compact) and other preferences persisted via `PreferencesStore` (localStorage adapter).
- **FR-1.9** A skip-to-content link, landmark regions (`nav`, `main`, `header`), a polite live region service for status announcements, visible focus styles, and `prefers-reduced-motion` disabling the design's animations.
- **FR-1.10** Component tests run axe (via `axe-core`) on every `ui/` component and shell state, in both themes.

### Acceptance Criteria

- **AC-1.1** With OS dark mode on and preference "system", the app renders dark on first paint; switching the OS to light updates it without reload.
- **AC-1.2** Choosing Suomi updates all shell text and `<html lang="fi">` without reload, and persists across reload.
- **AC-1.3** Deleting one key from the sv catalogue makes `pnpm verify:static` fail with the key name.
- **AC-1.4** axe reports zero violations for the shell in light and dark, at 320 px and 1280 px.
- **AC-1.5** Text and icon contrast ≥ 4.5:1 (≥ 3:1 for large text and UI components) for every token pair used, verified by a test over the token table.
- **AC-1.6** Navigating to `/repo/a/b` then pressing Back returns to `/`; reloading `/repo/a/b` renders the repo route.
- **AC-1.7** The network panel on load shows no request to fonts.googleapis.com, unpkg.com or any third-party origin.

---

## Scope 2: Auth and Accounts

### Functional Requirements

- **FR-2.1** `AuthPort` in `application/` with `signIn`, `refresh`, `signOut`, `currentToken(accountId)`; two adapters in `infrastructure/auth/`: `PatAuth` and `GitHubAppAuth`.
- **FR-2.2** PAT sign-in: user pastes a token; the app calls `GET /user` once, reads `X-OAuth-Scopes` (classic) or token prefix `github_pat_` (fine-grained), and accepts the token only on 200. Detected login, id, avatar, token type and scopes are stored on the account.
- **FR-2.3** Permission check after sign-in: one GraphQL probe confirms read access to pull requests, checks and org membership; missing permissions are listed with where to grant them. A classic token with `repo` shows a persistent "this token can write" warning.
- **FR-2.4** Dropped: GitHub does not expose the token-expiration header to browsers (CORS); an expired token surfaces as a 401 (FR-2.8). Decided 2026-10-15.
- **FR-2.5** `GitHubAppAuth`: when `VITE_GITHUB_APP_CLIENT_ID` and `VITE_GITHUB_APP_EXCHANGE_URL` are both set, run the web flow (redirect with `state` + PKCE `code_verifier`, callback route, POST code to the exchange URL, receive access + refresh token, refresh before expiry via the exchange URL). When either is empty the "Sign in with GitHub App" button is rendered disabled with an explanation. The exchange handler itself is out of scope.
- **FR-2.6** Multiple accounts: `AccountStore` holds accounts keyed by GitHub user id; the account menu lists them, switches the active account, and offers "Add GitHub account". Adding an account already present (same user id) updates its token instead of duplicating it.
- **FR-2.7** Per-account "remember me" (default off): off → token in `sessionStorage`; on → `localStorage`. Non-secret account data (login, avatar, favourites, preferences) is always in `localStorage`/IndexedDB.
- **FR-2.8** A 401 on any request marks only that account signed out and routes to re-auth for it; its favourites and cache are kept.
- **FR-2.9** "Remove account" deletes that account's token, favourites, seen markers and cached data. "Sign out of everything" clears all app storage (localStorage, sessionStorage, IndexedDB database) and reloads.
- **FR-2.10** Tokens never appear in logs, error messages, URLs, React DevTools-visible props of `ui/` components, or the IndexedDB cache.
- **FR-2.11** _(security)_ GitHub App callback: reject the callback unless `state` matches the stored value (single use, ≤ 10 min old); remove `code` and `state` from the URL with `history.replaceState` before any other work; require `VITE_GITHUB_APP_EXCHANGE_URL` to be `https:` (except `http://localhost` in dev). Refresh tokens follow the same storage rule as access tokens (FR-2.7).
- **FR-2.12** _(security)_ All cached and stored data is namespaced by account id; no query, cache read or seen marker can return another account's data.
- **FR-2.13** _(security)_ For an account with "remember me" off, cached GitHub data in IndexedDB is purged at startup when no session token exists for it — private-repo content must not outlive the session that was allowed to read it.

### Acceptance Criteria

- **AC-2.1** Pasting a valid fine-grained PAT signs in with one `GET /user` call; an invalid token shows an error and stores nothing.
- **AC-2.2** A classic PAT with `repo` shows the write-access warning.
- **AC-2.3** With both GitHub App env vars empty, the GitHub App button is disabled and announces why to screen readers; with both set (test config), the button starts a redirect containing `client_id`, `state` and `code_challenge`.
- **AC-2.4** Two accounts can be added and switched; each shows only its own login and data. Re-adding the same user replaces its token (one entry).
- **AC-2.5** With "remember me" off, closing and reopening the browser (new session) requires sign-in again; with it on, it does not.
- **AC-2.6** After "Sign out of everything", localStorage, sessionStorage and the app's IndexedDB database are empty.
- **AC-2.7** A test asserts that no token string appears in any IndexedDB record, console output or thrown error message across the auth test suite.
- **AC-2.8** _(security)_ A callback with a missing, mismatched or reused `state` is rejected without calling the exchange URL; after a valid callback the address bar contains neither `code` nor `state`.
- **AC-2.9** _(security)_ With accounts A and B cached, every read while B is active returns only B's records (test over each store).
- **AC-2.10** _(security)_ Account with "remember me" off: after a simulated new browser session, its IndexedDB records are gone before any view renders.

---

## Scope 3: GitHub Data Layer, Cache and Quota

### Functional Requirements

- **FR-3.1** `GitHubReadPort` with operations for viewer/orgs/teams, repo list page, favourite PR batches, Home search sections, PR detail and check runs. Implemented in `infrastructure/github/` over GraphQL (`POST /graphql`) and REST.
- **FR-3.2** Every GitHub response is validated with Zod in the adapter and mapped to domain types; a validation failure becomes a typed `GitHubError` of kind `schema`, never a crash.
- **FR-3.3** REST requests send `If-None-Match` with the stored ETag; a 304 reuses the cached body.
- **FR-3.4** Rate-limit tracker per account and pool (core, graphql, search) fed from `x-ratelimit-*` headers and GraphQL `rateLimit { cost remaining resetAt }`.
- **FR-3.5** `CachePort` over IndexedDB with a schema version; on version mismatch or a corrupt record the database is dropped and rebuilt silently. Stores: repo list, PR list per query key, PR detail, seen markers, request metadata (etag, fetchedAt).
- **FR-3.6** TanStack Query is hydrated from `CachePort` before the first render of data views (cache-first), then refetched in the background.
- **FR-3.7** Refresh scheduler: every 5 minutes while `document.visibilityState === 'visible'`; on focus if the last refresh is > 60 s old; paused while hidden; manual refresh always allowed.
- **FR-3.8** Quota guard: remaining < 20% of the GraphQL pool → interval doubles; < 5% → auto-refresh stops until `resetAt`. Secondary limits (403/429 with `retry-after`) pause all requests for that account until `retry-after` elapses. Queries run sequentially per account.
- **FR-3.9** Cross-tab: one leader tab per browser holds a Web Lock (`ghd-refresh`) and performs refreshes; it publishes changes on a `BroadcastChannel`; followers update from the channel and the shared IndexedDB. If the leader closes, another tab acquires the lock.
- **FR-3.10** Org access errors: GraphQL errors of type `FORBIDDEN` with SAML/SSO or fine-grained-approval messages, and missing app installation, are mapped to `OrgAccessIssue { org, reason, fixUrl }` and surfaced in the sidebar/Home; other owners' data still renders.
- **FR-3.11** Partial GraphQL errors render successful parts and flag failed repos in place. Network offline shows cached data with an "Offline / stale since …" banner and retries on `online`.
- **FR-3.12** Header shows "Updated N min ago" (live-updating) and a quota indicator; the quota popover lists each pool's remaining/limit and reset time for the active account, plus the guard explanation.
- **FR-3.13** `packages/testing` (or `apps/web/tests/fixtures`) holds recorded GitHub GraphQL/REST fixtures and factories; MSW handlers serve them in adapter tests and count requests and GraphQL cost.
- **FR-3.14** _(security)_ GraphQL queries are static documents with typed variables — no user input is ever concatenated into a query string. Route params and search params (`owner`, `name`, `number`) are validated against GitHub's name rules (`^[A-Za-z0-9-]{1,39}$` owner, `^[A-Za-z0-9._-]{1,100}$` repo, positive integer number) before use; invalid values render a not-found view without a request.

### Acceptance Criteria

- **AC-3.1** **Quota budget tests** (fixture-driven, assert counted requests and summed GraphQL `cost`): a Home refresh makes one GraphQL search request per section per 20 results (3 when each section has ≤ 20 open PRs, ≤ 5 for 60), 1 point each, plus ≤ ⌈k/10⌉ one-point "new activity" requests for the k rows with activity newer than their seen marker (none when k = 0); a refresh of 60 favourites makes exactly 3 GraphQL requests; opening an uncached PR makes ≤ 2 GraphQL requests (0 REST); opening a cached, unchanged PR makes 0 requests.
- **AC-3.2** Simulated steady state of 1 hour at the 5-minute interval with 25 favourites spends < 1,000 GraphQL points.
- **AC-3.3** With GraphQL remaining at 15%, the next scheduled refresh is 10 minutes away; at 4%, no automatic request is made until `resetAt`.
- **AC-3.4** A REST call returning 304 serves the cached body and does not change the rendered data.
- **AC-3.5** Bumping the cache schema version on reload discards old data without an error and refetches.
- **AC-3.6** With two tabs open, only one makes GitHub requests during a refresh cycle; closing it makes the other take over within one cycle.
- **AC-3.7** A fixture with one SSO-protected org shows that org's "Fix access" link while other owners' PRs render.
- **AC-3.8** A malformed GitHub response produces a visible, non-crashing error for that query and a `schema` error in the test.
- **AC-3.9** Going offline shows the stale banner with the last refresh time; going online triggers a refresh.
- **AC-3.10** _(security)_ Visiting `/repo/a%22%7D/b` or `/repo/a/b/pull/1x` shows not-found and makes no GitHub request.

---

## Scope 4: Repositories and Favourites

### Functional Requirements

- **FR-4.1** The repo list for the active account (viewer repos + every org the viewer belongs to, via `viewer.repositories` and `organization.repositories`, paginated 100 per page) is loaded once, cached 24 h, and refreshable manually from the sidebar.
- **FR-4.2** Sidebar: Favourites section (with live open-PR counts) above a Repositories section listing every repository as one flat `owner/name` list, A–Z. _Amended 2026-10-16 at the owner's request: was grouped by owner with a per-owner collapse._
- **FR-4.3** Repo search filters by `owner/name` substring, or as a JavaScript regex when the input contains regex metacharacters; an invalid regex shows an inline error and no results change. Regex evaluation is guarded against catastrophic backtracking (input length cap, evaluation over names only).
- **FR-4.4** Favourite toggle on sidebar rows and the repo page; favourites stored per account with `owner/name` and node id.
- **FR-4.5** Favourites refresh in batches of 25 per GraphQL query (open PRs with BR-11 fields), on the Scope 3 schedule.
- **FR-4.6** Repo page: owner/name, visibility, description, open and stale counts, favourite toggle, "Open on GitHub", and Open / Draft / Needs review tabs with counts; list uses the Scope 5 row component.
- **FR-4.7** A favourite whose node id resolves to a new `nameWithOwner` is updated silently; one that no longer resolves is marked unavailable with a "Remove" action.
- **FR-4.8** Above ~50 favourites, show a non-blocking notice about refresh cost.

### Acceptance Criteria

- **AC-4.1** An account with 3 orgs and 450 repos loads the full list in ≤ 5 GraphQL requests and does not request it again within 24 h unless refreshed manually.
- **AC-4.2** Typing `^auth|service$` lists only matching repos; typing `(` shows the invalid-regex message.
- **AC-4.3** Favouriting a repo moves it to Favourites and adds its open PRs to the next favourites refresh; un-favouriting removes it.
- **AC-4.4** A renamed favourite shows its new name after refresh; a deleted one shows "Unavailable" with Remove.
- **AC-4.5** Repo page tabs show correct counts against a fixture with open, draft and unreviewed PRs; no closed PRs are requested.

---

## Scope 5: Home and PR List

### Functional Requirements

- **FR-5.1** `domain/sections.ts`: a pure function assigning each PR to one Home section by the ordered rule table in the pitch's Business Rules (rules 1–6), returning section and reason chip. Rule 5 ("Ready to merge") uses `mergeable`, the CI rollup and the review decision, not `mergeStateStatus` (amended 2026-10-16).
- **FR-5.2** `domain/rereview.ts`: re-requested when the viewer has ≥ 1 review and either the head commit date is newer than the viewer's latest review or the latest `REVIEW_REQUESTED_EVENT` for the viewer is newer than it.
- **FR-5.3** `domain/activity.ts`: "+N new" counts comments, reviews and review-thread replies by authors other than the viewer and not bots (`__typename === 'Bot'` or login ending `[bot]`), newer than the seen marker; returns `null` (hidden) when no marker exists. "Stale" = no human comment, review or commit for ≥ 14 days.
- **FR-5.4** Home queries: up to 3 GraphQL `search(type: ISSUE)` queries — `is:pr is:open review-requested:@me`, `is:pr is:open author:@me`, `is:pr is:open reviewed-by:@me -author:@me` (re-review candidates) — each `first: 20` with cursor pagination to the 1,000-result cap; results merged and de-duplicated by node id. No list query selects `mergeStateStatus`; conflicts come from `mergeable`, CI from `PullRequest.statusCheckRollup`. _Amended 2026-10-16 after measurement: rows of 100 exceed GitHub's 10 s limit — see `docs/architecture/github-query-costs.md`._
- **FR-5.5** Home view: three sections with counts and hints per the design; each section collapsible; empty-section text; a "results truncated" notice when any search hit the cap.
- **FR-5.6** PR row component (`ui/`) showing every BR-11 field, status as icon + text, the reason chip, "+N new", and a link to GitHub; comfortable and compact densities.
- **FR-5.7** Filters: text (title, repo, author, number), label, updated (any / 24 h / 7 d / 30 d / stale), drafts on/off; sorts: recently updated (the default, newest first), waiting longest, newest, smallest. Filter state in the URL search params; "Reset" clears it. _Amended 2026-10-16 at the owner's request: the default sort was waiting longest._
- **FR-5.8** Seen markers stored per account per device in `CachePort`; set when the PR panel opens or "Open in GitHub" is clicked.
- **FR-5.9** Long lists are virtualised or paginated so 500 rows keep scrolling smooth.

### Acceptance Criteria

- **AC-5.1** Table-driven tests cover every rule 1–6, the precedence between overlapping conditions (e.g. own PR with changes requested and failing CI → "Changes requested"), and drafts never reaching "needs action" except via rule 2.
- **AC-5.2** Re-review tests: review then new commit → re-requested; review then new request event → re-requested; review after the latest commit and request → not re-requested.
- **AC-5.3** "+N new" ignores the viewer's own and bot comments, and is hidden when no marker exists; opening the panel resets it to 0.
- **AC-5.4** A review request on a repo that is not a favourite appears in "Needs your review".
- **AC-5.5** Filter and sort state survives reload via the URL; "Reset" restores defaults.
- **AC-5.6** Each row exposes its status in text to screen readers (axe passes; a test reads the accessible name).
- **AC-5.7** A fixture returning 1,000+ search results shows the truncation notice.

---

## Scope 6: PR Detail Panel

### Functional Requirements

- **FR-6.1** Opening a PR (row click, Enter, or deep link) opens a modal side panel with header (title, number, repo, author, base ← head, "Open in GitHub") and tabs Conversation, Checks, Details.
- **FR-6.2** Conversation: description (rendered GitHub `bodyHTML`, sanitised — see FR-6.6), comments, reviews and review threads with file path, line, diff-hunk snippet and resolved state; filters All / Unresolved / Humans; bot activity collapsed by default; 50 timeline items per page with "Load more".
- **FR-6.3** Checks: one GraphQL query per head SHA (`commit.checkSuites → checkRuns`) listing name, app, status/conclusion, duration, required flag (`CheckRun.isRequired(pullRequestNumber:)`, omitted when not readable), output title/summary and annotations (path, line, level, message) for failing runs only. No raw logs. _Amended 2026-10-16: GraphQL replaces the planned REST call — REST has no required flag and needs one extra call per failing run for annotations._
- **FR-6.4** Details: reviewers with state, labels, assignees, milestone, created/updated times, mergeable state.
- **FR-6.5** Detail cache key = PR `updatedAt` + head SHA. Check runs are refetched at most every 60 s while any is queued/in progress, and never again once all are completed for that SHA.
- **FR-6.6** GitHub-rendered HTML (`bodyHTML`, comment `bodyHTML`) is sanitised with an allow-list (DOMPurify or equivalent) before rendering; links get `rel="noopener noreferrer" target="_blank"`; images from non-GitHub origins are not loaded (CSP `img-src`). Images in PR content (GitHub user-attachments, camo) are not loaded either; they render as a labelled "Image — open in GitHub" link, so `img-src` stays limited to avatars. The sanitiser output passes through the single Trusted Types policy.
- **FR-6.7** Panel is a modal dialog: focus moves to its heading on open, is trapped while open, returns to the triggering row on close; Esc closes; it has an accessible name.
- **FR-6.8** Opening the panel or clicking "Open in GitHub" sets the seen marker (FR-5.8).
- **FR-6.9** No approve, comment, merge or re-run controls exist anywhere in the panel.

### Acceptance Criteria

- **AC-6.1** Opening an uncached PR issues ≤ 2 GraphQL requests (0 REST); reopening it unchanged issues 0.
- **AC-6.2** A PR with a running check refetches check runs at ≤ 60 s intervals while open and stops once all complete.
- **AC-6.3** A description containing `<script>`, `onerror=` attributes or `javascript:` links renders without executing script (test asserts sanitised DOM).
- **AC-6.4** Keyboard-only: open with Enter, Tab cycles inside the panel, Esc closes and focus returns to the same row; axe passes with the panel open.
- **AC-6.5** "Load more" fetches the next 50 timeline items for a PR with 120 items.
- **AC-6.6** The Unresolved filter shows only unresolved threads; Humans hides bot items.

---

## Scope 7: Command Palette and Shortcuts

### Functional Requirements

- **FR-7.1** ⌘K / Ctrl+K opens a command palette (modal combobox) searching favourites, all cached repos, cached PRs (title / number) and actions (go home, toggle theme, switch language, switch account, refresh). Results come from cache only — no GitHub request.
- **FR-7.2** Palette follows the ARIA combobox + listbox pattern: arrow keys move, Enter runs, Esc closes and restores focus.
- **FR-7.3** List shortcuts J/K (move), Enter (open), Esc (close panel), `/` (focus filter) — active only when focus is within the PR list or body and not in a text field; J/K can be disabled in Settings. Shortcut hints shown per the design.
- **FR-7.4** Refresh results are announced through the live region ("Updated, 3 new"), at most once per refresh.

### Acceptance Criteria

- **AC-7.1** Opening the palette and searching causes zero network requests.
- **AC-7.2** Typing in the filter input and pressing J inserts "j" instead of moving selection.
- **AC-7.3** With J/K disabled in Settings, J does nothing in the list.
- **AC-7.4** A screen-reader test (accessible-tree assertion) observes one polite announcement per refresh.
- **AC-7.5** axe passes with the palette open.

---

## Scope Final: End-to-End Hardening

### Functional Requirements

- **FR-F.1** Playwright journeys against the nginx prod-like stack with GitHub mocked via `page.route` fixtures: PAT sign-in → Home sections → open PR panel → favourite a repo → repo page → switch account → sign out of everything.
- **FR-F.2** E2E asserts the production CSP header is present and that the browser reports no CSP violations during the journeys.
- **FR-F.3** axe runs on every journey step in both themes and at 320 px.
- **FR-F.4** Finnish and Swedish strings reviewed by the PO; the review is recorded in the PR.
- **FR-F.5** Docs: README quick start (create a fine-grained PAT with the listed read permissions), local nginx run, how to enable the GitHub App later (register app, set the two env vars, deploy an exchange handler meeting ADR 0016).

### Acceptance Criteria

- **AC-F.1** `pnpm stack:prod-like && pnpm test:e2e` passes in CI.
- **AC-F.2** No CSP violation and no request to a non-allow-listed origin occurs in any journey.
- **AC-F.3** axe reports zero violations across all journeys.
- **AC-F.4** A new contributor can run the app with a PAT by following the README alone.
