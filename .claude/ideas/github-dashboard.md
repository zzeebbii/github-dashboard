# Framed Idea: GitHub Dashboard

## What

### Current State

Work is tracked across GitHub's own surfaces — `github.com/pulls`, notifications, and each repository's PR tab. Repositories under personal accounts and organisations are scattered, and no single view shows a curated set of _your_ repos with their PRs (authored, review-requested, CI status, staleness) together. The repository itself is a generic full-stack starter template (React SPA + Hono API + PostgreSQL + contract package + Docker deployment) with a "Tasks" example feature; none of it is GitHub-specific yet.

### Problem Statement

A developer working across several personal and organisation repositories has no single, fast, trustworthy view of their pull-request workload. Building one is constrained by:

1. **Rate limits** — ~5,000 requests/hour per token; a naive dashboard polling every repo and PR exhausts it quickly.
2. **Org access** — classic PATs need SSO authorisation for some orgs, fine-grained PATs need org opt-in/approval, and a GitHub App must be installed on each org.
3. **Auth architecture** — a PAT can be used purely client-side, but GitHub App user sign-in requires exchanging a code for a token at an endpoint that cannot be called from the browser, implying at least a minimal server-side piece.

The goal: a dashboard scoped to repositories the user chooses, showing complete, fresh PR data while spending as little API quota as possible — and meeting modern web standards (i18n, light/dark themes, maximum accessibility).

## Why

**Why customers need this:**
For now the user is the author; other developers could use it in future. It provides a unified view that GitHub does not support — today you have to open new tabs to see CI statuses, PRs, etc.

**Uniqueness:** 3/5 — Enhanced core
Market has versions of this, but our approach adds significant value. Existing tools require trusting a third party with your PAT and are bloated with unwanted features; this one keeps the token on the user's side and shows only what is needed.

**Why this is important for the business:**
Saves time tab-hopping and ensures review requests are not missed.

**Strategic Objectives alignment:**
High-impact Features and AI _(selected from a local snapshot; not linked in Fibery)_

**Value Expectation:** 2/5 — Local improvement
Benefits a single user segment or removes a known pain point.

## Business Case

No business case — personal/hobby tool.

## For Who

Covered in previous sections above.

## Effort and Feasibility

**Rough effort estimate:** No fixed estimate — delivered in phases and takes as long as it needs (initial AI guess of 2 weeks, 1 developer with AI help, was made before the designs expanded the scope)
**Estimate made by:** AI (superseded by the PO: no estimate required)

**Feasibility:** 5/5 — Fully autonomous
Team can deliver end-to-end. Existing components, familiar stack, clear interfaces. No research needed.

## Portfolio Value Scoring

Uniqueness: 3
Value Expectation: 2
Feasibility: 5

**Intelligent Preparation Score: 3.3**
(2 × 0.5 + 3 × 0.1 + 5 × 0.4 = 3.3)

## Technical Context

- **No GitHub functionality exists yet.** The only feature is the template's "Tasks" example, running through every layer (UI, data hooks, API client, contract, backend, database).
- **Reusable regardless of architecture:** the React front-end structure (styling, routing, TanStack Query data/cache layer), the rule that only `apps/web/src/infrastructure/` touches the network (a natural home for a GitHub client + cache), browser-mode component tests, Playwright E2E, the `pnpm verify` gate and CI.
- **Candidates for removal if the browser talks to GitHub directly:** the Hono backend, PostgreSQL + Drizzle migrations, the shared contract package and generated `artifacts/openapi.json`, and much of the Docker setup. If GitHub App sign-in is kept, a tiny token-exchange endpoint (or serverless function) could replace the whole backend. Removing these reverses several existing ADRs (0002, 0004, 0006, 0010) and needs new ADRs.
- **Not present yet:** internationalisation, a theme toggle, and automated accessibility checks.
- **Quota-saving levers to evaluate in the spec:** GraphQL to batch many repos/PRs into one query, REST conditional requests (ETag / `If-None-Match`; 304 responses don't count against the limit), persistent client-side caching (e.g. IndexedDB) with stale-while-revalidate, and reading rate-limit headers to back off.

---

## Requirements

### In Scope

1. **Authentication** — paste a PAT (classic or fine-grained) in phase 1; GitHub App sign-in built behind the same auth port with placeholder config, enabled in a later phase. Multiple GitHub accounts with a switcher.
2. **Repository discovery and favourites** — browse every repo the active account can reach, grouped by owner (user + each org), searchable with text or regex; mark favourites per account.
3. **Home** — open PRs involving you across every accessible repo, grouped into _Needs your review_, _Your PRs · needs action_, _Your PRs · waiting_.
4. **Repository page** — open PRs of one repo with Open / Draft / Needs review tabs.
5. **PR rows** — title, repo#number, author, labels, draft, review decision, CI status, conflicts, comments with "+N new", diff size, age/updated, reason chip, link to GitHub.
6. **PR detail panel** — Conversation, Checks (check-run output and annotations), Details; fetched on open and cached.
7. **Freshness and quota** — cache-first load, background refresh, last-updated indicator, per-pool quota popover, quota guard.
8. **Filtering, sorting, command palette, keyboard shortcuts, deep-linkable URLs.**
9. **Web standards** — English, Finnish, Swedish; light/dark/system themes; WCAG 2.2 AA; responsive from 320 px; comfortable/compact density.

### Out of Scope

1. Any write action — approve, comment, merge, re-run checks. Everything actionable links to GitHub.
2. Issues, projects, discussions, the notifications inbox, and the "Watching"/mentions section.
3. Closed and merged PRs.
4. GitHub Enterprise Server (self-hosted). GitHub.com only, including Enterprise Cloud orgs.
5. User accounts, server-side database, cross-device sync. All state lives in the browser.
6. Push notifications, email alerts, notification settings.
7. Other Git hosts (GitLab, Bitbucket).
8. Analytics or metrics (cycle time, review-load charts).
9. Raw CI log lines.
10. German (and any language beyond en/fi/sv) in v1.

### Business Requirements

_Accounts and auth_

- **BR-1.** Sign in with a GitHub PAT (classic or fine-grained), validated with one call before it is accepted. GitHub App sign-in uses the same auth port; its client ID and exchange URL come from config (`VITE_GITHUB_APP_CLIENT_ID`, `VITE_GITHUB_APP_EXCHANGE_URL`, empty by default). While unset, the "Sign in with GitHub App" button is shown disabled with an explanation.
- **BR-2.** Multiple GitHub accounts can be added and switched from the account menu. Each account has its own token, favourites, preferences, seen markers and quota.
- **BR-3.** Tokens are sent only to api.github.com. When the GitHub App is enabled, code exchange and token refresh go through a stateless function that stores nothing. Token storage follows a per-account "remember me": `sessionStorage` by default, `localStorage` when ticked.
- **BR-4.** Removing an account deletes its token and all its cached data; "sign out of everything" wipes all app storage.

_Repositories_

- **BR-5.** The sidebar lists every repo the active account can reach, grouped by owner, searchable by text or regex (an invalid regex shows an inline error). The full list loads once with pagination, is cached 24 h, and can be refreshed manually. Live open-PR counts are shown for favourites only.
- **BR-6.** The user can mark repos as Favourites (per account). Favourites are pinned in the sidebar and refreshed in the background.
- **BR-7.** When an organisation can't be reached (SSO not authorised, fine-grained PAT not approved, app not installed), the app names the org and the reason, with a "Fix access" link; other owners keep working.

_Home_

- **BR-8.** Home groups open PRs involving you into _Needs your review_, _Your PRs · needs action_, _Your PRs · waiting_, using the section rules below. Each row shows a reason chip.
- **BR-9.** Home covers every repo you can access (not just favourites), using at most 3 GraphQL search queries per refresh, for the active account only.

_Repository page_

- **BR-10.** A repo page shows name, visibility, description, open and stale counts, a favourite toggle, a GitHub link, and Open / Draft / Needs review tabs (open PRs only).

_PR rows_

- **BR-11.** Each row shows title, repo#number, author, labels, draft state, age and last update, review decision with approvers and pending reviewers/teams, CI status, conflicts, comment count with "+N new", lines added/removed.
- **BR-12.** Filter by text, label, updated (any time / 24 h / 7 d / 30 d / stale), drafts on/off; sort by waiting longest, recently updated, newest, smallest. Filters can be reset.

_PR detail panel_

- **BR-13.** Opening a PR (click or Enter) shows a side panel: **Conversation** (description, comments, reviews, review threads with code snippets and resolved state; filters All / Unresolved / Humans; collapsible bot activity), **Checks** (each check run's status, duration, required flag, output summary and annotations — no raw logs), **Details** (reviewers, metadata), and a header with base ← head branches and an **Open in GitHub** button. No approve or re-run buttons.
- **BR-14.** Panel data is fetched only when a PR is opened. Cache key = PR `updatedAt` + head SHA; check runs have a 60 s TTL while any check is pending and are cached permanently once all have completed. The panel shows 50 timeline items with "Load more".

_Navigation_

- **BR-15.** Command palette (⌘K / Ctrl+K) searches repos, PRs and actions (theme, language, account). Shortcuts J/K (move, only when the list has focus, can be disabled), Enter (open), Esc (close), `/` (search).
- **BR-16.** Home, repo and open-PR views have their own URL; browser Back works.

_API efficiency and freshness_

- **BR-17.** All GitHub data is cached in IndexedDB (versioned schema); on open the app shows cached data immediately and refreshes in the background.
- **BR-18.** Quota budget, asserted by tests against recorded fixtures:
  - Home refresh: ≤ 3 GraphQL search queries (≤ 100 PRs each), ≤ 50 points total.
  - Favourites refresh: 1 GraphQL query per 25 favourites (~1–2 points each).
  - PR open: ≤ 2 GraphQL queries + 1 REST check-runs call; 0 when served from cache.
  - Steady state at a 5-minute interval: < 1,000 points/hour (20% of 5,000).
  - Never one request per PR for list data; REST calls use ETag conditional requests.
- **BR-19.** Auto-refresh every 5 minutes while visible; on focus if data is > 1 minute old; manual refresh; paused while the tab is hidden. Only one tab refreshes (leader via `navigator.locks`); other tabs receive updates through `BroadcastChannel` and the shared IndexedDB cache.
- **BR-20.** A quota popover shows each pool (REST core, GraphQL, search) for the active account with remaining/limit and reset time. Below 20% remaining auto-refresh halves; below 5% it pauses until the reset (manual refresh still allowed).

_Web standards_

- **BR-21.** UI available in English, Finnish and Swedish, switchable at runtime; English is the fallback; dates and numbers use `Intl` in the selected language. GitHub content is never translated. CI fails if fi or sv is missing a key.
- **BR-22.** Theme: light / dark / system (default system) in Settings, plus a quick light/dark toggle in the header; the choice persists.
- **BR-23.** WCAG 2.2 AA with axe checks in component and E2E tests (see accessibility criteria under UI/UX Notes).
- **BR-24.** Layout works from 320 px; sidebar collapses on narrow screens; comfortable/compact density preference.

### User Stories

1. As a developer, I want to sign in with a PAT now and a GitHub App later, so that I can start quickly and move to managed access when it's set up.
2. As a developer with work and personal accounts, I want to switch between them, so that I see each one's work separately with its own quota.
3. As a developer, I want to find any repo I can access with text or regex and mark favourites, so that my main repos are one click away.
4. As a developer, I want Home to show my review requests and my PRs from every repo, grouped by what needs doing, so that I never miss a review request.
5. As a developer, I want each row to say why it needs me and what's new since I last looked, so that I can triage without opening anything.
6. As a developer, I want to filter by staleness, label and draft state and sort by waiting time, so that the oldest blocked work surfaces first.
7. As a developer, I want to open a PR and read its conversation, review threads and failing checks in the dashboard, so that I can decide what to do without a new tab.
8. As a keyboard user, I want a command palette and J/K navigation, so that I can do everything without a mouse.
9. As a developer, I want bookmarkable URLs for repos and PRs, so that Back and links work as expected.
10. As a developer, I want to see each quota pool and the last refresh time, so that I can trust the data.
11. As a developer, I want to remove an account and have its data wiped, so that nothing is left behind on a shared machine.
12. As a user, I want the app in English, Finnish or Swedish and in my preferred theme, so that it's comfortable to use.

### Business Rules

**Home section rules** — evaluated in order; first match wins; each PR lands in exactly one section. Implemented as pure functions in `domain/` with table-driven tests.

| #   | Condition                                                                   | Section                 | Reason chip                                      |
| --- | --------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| 1   | You are a requested reviewer (directly or via a team) or a re-review is due | Needs your review       | "Review requested" / "Re-requested" / "Team: @x" |
| 2   | Your PR, `reviewDecision = CHANGES_REQUESTED`                               | Your PRs · needs action | "Changes requested"                              |
| 3   | Your PR, head commit check rollup `FAILURE` or `ERROR`                      | needs action            | "CI failing"                                     |
| 4   | Your PR, `mergeable = CONFLICTING`                                          | needs action            | "Merge conflicts"                                |
| 5   | Your PR, not draft, `mergeStateStatus = CLEAN`                              | needs action            | "Ready to merge"                                 |
| 6   | Any other PR of yours (draft, pending review or CI, unknown)                | Your PRs · waiting      | "Draft" / "Awaiting review" / "CI running"       |

Drafts never appear in "needs action" except via rule 2.

**Definitions**

- **Re-requested** — you have submitted at least one review, and the head commit is newer than your latest review, _or_ the latest `REVIEW_REQUESTED_EVENT` for you is newer than your latest review. Read from the Home search query (`reviews(author:)`, `commits(last:1)`, `timelineItems(REVIEW_REQUESTED_EVENT, last:1)`) at no extra cost.
- **"+N new"** — comments, reviews and review-thread replies by people other than you and not bots, newer than your seen marker. The marker is set when you open the PR in the panel or click "Open in GitHub". Markers are per account and **per device**. With no marker, the count is hidden.
- **Stale** — no human activity (comment, review or commit; bot activity ignored) for 14 days or more.
- **Waiting longest** — for review requests: time since the request; for your PRs: time since the last push.
- **Smallest** — lines added + lines removed.

**Refresh and quota**

- Refresh interval fixed at 5 minutes while visible; on focus if data is > 1 minute old; paused while hidden.
- Quota guard: < 20% remaining → interval doubles; < 5% → auto-refresh stops until reset.
- Home refresh runs for the active account only; other accounts refresh when switched to.
- Only open PRs are fetched.
- No hard limit on favourites; warn above ~50.

**Tokens**

- "Remember me" per account, off by default (`sessionStorage`); on → `localStorage`.
- Warn 7 days before a fine-grained PAT expires.
- Warn that a classic PAT's `repo` scope grants write access.
- A 401 signs out only that account; its cache stays until removed or re-authenticated.

### Edge Cases and Error States

| Situation                                                            | Behaviour                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Token invalid, expired or revoked (401)                              | Mark that account signed out and return to sign-in with a clear message; keep its favourites.                |
| Token missing scopes/permissions                                     | Name the missing permission and where to grant it.                                                           |
| Org requires SSO / fine-grained PAT not approved / app not installed | Show the affected org with a "Fix access" link; other owners keep working.                                   |
| Tracked repo deleted, renamed or inaccessible                        | Mark it unavailable and offer to remove it; follow renames via the stored node id.                           |
| Rate limit hit (primary or secondary)                                | Stop refreshing, show the reset time, keep cached data; honour `Retry-After`; run queries one after another. |
| Offline or GitHub down                                               | Show cached data with an "Offline / stale since …" banner; retry on reconnect.                               |
| GraphQL partial errors                                               | Render successful repos; flag failed ones in place.                                                          |
| CI or mergeable state not computed yet                               | Show "pending" / "unknown"; pick up the value on the next refresh.                                           |
| No favourites / no PRs match                                         | Helpful empty state pointing to the next step.                                                               |
| Cache missing, corrupt or from an older schema version               | Discard silently and fetch fresh.                                                                            |
| Very large lists                                                     | Paginate; virtualise long lists. Search results capped at 1,000 with a "results truncated" notice.           |
| PR with hundreds of timeline items                                   | 50 at a time with "Load more".                                                                               |
| Several tabs open                                                    | One leader tab refreshes; others follow via `BroadcastChannel`.                                              |
| GitHub App config empty                                              | GitHub App sign-in button disabled with an explanation.                                                      |

### Data

**Stored by the app (browser only)**

| Data                                                                                                     | Where                                                | Notes                                                          |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Per account: token, token type (PAT / GitHub App), expiry, refresh token (GitHub App)                    | `sessionStorage` or `localStorage` per "remember me" | Never logged or sent to error reports.                         |
| Per account: login, id, avatar URL                                                                       | IndexedDB                                            | Used for "authored by me" and review requests.                 |
| Per account: favourites (`owner/name` + node id)                                                         | localStorage                                         | Node id follows renames.                                       |
| Per account: seen markers (PR node id → timestamp)                                                       | IndexedDB                                            | Per device.                                                    |
| Preferences: theme, language, density, default filters/sort, J/K enabled                                 | localStorage                                         |                                                                |
| Repo list cache (24 h TTL)                                                                               | IndexedDB                                            |                                                                |
| PR list cache (BR-11 fields) + `etag` / `fetchedAt` per request                                          | IndexedDB                                            | Schema-versioned; old versions discarded.                      |
| PR detail cache (description, comments, reviews, review threads, check runs with output and annotations) | IndexedDB                                            | Only for PRs the user opened; keyed by `updatedAt` + head SHA. |
| Rate-limit state per pool                                                                                | Memory, from response headers                        |                                                                |

**Read from GitHub (read-only):** viewer, orgs and teams; accessible repos; open PRs (search + per-favourite queries) with review requests, reviews, head commit check rollup, labels, mergeable state; PR detail timeline; check runs with output and annotations.

**Not stored:** diffs or file contents beyond review-thread snippets, raw CI logs, closed/merged PRs.

**Token permissions (read-only)**

- Fine-grained PAT / GitHub App: Metadata, Pull requests, Commit statuses, Checks (all read); organisation Members (read) for team review requests.
- Classic PAT: `repo` (needed for private repos; also grants write — warned in the UI) and `read:org`.

### UI/UX Notes

- **Visual source of truth:** `docs/pr-dashboard-designs/PR Dashboard.dc.html` — Geist / Geist Mono, Lucide icons, the light and dark tokens it defines, and its layout (sidebar with account menu, favourites, repo search; header with search, quota and refresh; Home sections; repo page; PR side panel; command palette; keyboard hints).
- Fonts and icons are **self-hosted** (the design loads them from Google Fonts and unpkg) so the CSP can stay strict.
- Status is always icon **plus** text label, never colour alone.
- "Updated N min ago" and quota live in the header.
- Remove the design's approve, re-run, closed-tab, Watching section, German and notification-settings elements.

**Accessibility acceptance criteria** (each with a component test)

- Side panel and command palette are modal: focus is trapped, returns to the trigger on close, Esc closes.
- List refreshes are announced politely ("Updated, 3 new").
- J/K shortcuts work only when the list has focus and can be turned off in Settings.
- Every interactive element is a real `<button>`, `<a href>` or labelled `<input>`; icon-only buttons have `aria-label`.
- Text contrast ≥ 4.5:1 in both themes; reduced-motion preference respected.

---

## Dependency Analysis

### Repository Impact

| Repository / area                                                     | Impacted?            | Nature of Changes                                                                                                                        |
| --------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Netvisor.net, Controller, MyNetvisor-Api, Netvisor-Mobile             | No                   | N/A — standalone personal project.                                                                                                       |
| `apps/web`                                                            | Yes                  | The whole app: GitHub data layer, IndexedDB cache, auth port (PAT + GitHub App), views, i18n, themes, accessibility.                     |
| `apps/api`                                                            | Yes — removed        | Tasks example, PostgreSQL and Drizzle removed. A stateless GitHub App exchange/refresh function is added later, when the app is enabled. |
| `packages/contracts`, `artifacts/openapi.json`                        | Yes — likely removed | No own API to share. GitHub responses are validated with Zod at the adapter boundary in `apps/web`.                                      |
| `packages/testing`, `e2e/`                                            | Yes                  | Replace Tasks fixtures with GitHub fixtures; E2E against MSW-mocked GitHub.                                                              |
| Tooling (compose, Dockerfiles, CI, dependency-cruiser, knip, scripts) | Yes                  | Remove Postgres and contract-drift steps; update architecture rules; deploy as a static site.                                            |
| `docs/` and ADRs                                                      | Yes                  | New ADRs superseding 0002, 0004, 0006, 0010; update AGENTS.md and architecture docs.                                                     |

### External Integrations

| System                                 | Dependency Type | Notes                                                                                                                           |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GitHub GraphQL API                     | Read            | Lists, search, PR detail; point-based rate limit.                                                                               |
| GitHub REST API                        | Read            | Rate-limit status, check runs with output and annotations; ETag conditional requests.                                           |
| GitHub OAuth (GitHub App user sign-in) | Auth            | Code exchange and refresh need the client secret; done by a stateless function in a later phase. Placeholder config until then. |
| Google Fonts, unpkg (Lucide)           | Static assets   | Self-hosted instead, to keep the CSP strict.                                                                                    |

### Internal Dependencies (Blockers)

- An ADR on "SPA only, plus an optional stateless token-exchange function" before the template cleanup.
- A GitHub App registration (client ID/secret, read-only permissions, callback URL) — needed only to **enable** GitHub App sign-in, not for phase 1.
- ~~Hosting target~~ — resolved: host-agnostic static SPA; nginx container for local development (see Infrastructure & Configuration).

### Downstream Dependencies

_None._

### Database Changes

- Remove PostgreSQL, Drizzle, migrations and their integration tests.
- Add a versioned IndexedDB schema in the browser (repo list, PR list, PR detail, seen markers, per-account data); a version bump discards the old cache.

### Infrastructure & Configuration

- **Host-agnostic deployment:** the build output is plain static files (`index.html` + hashed assets) that run on any static host or CDN. No host-specific APIs, edge functions or rewrites are required beyond an SPA fallback to `index.html` (or hash-based routing). All runtime config is build-time `VITE_*` values. Local development and the prod-like stack serve the build behind the existing nginx container (`apps/web/nginx.conf`), which also carries the reference security headers. The later GitHub App exchange function is a small, standard HTTP handler (POST in, JSON out) so it can run as any serverless function or container.
- Security headers (reference config in nginx; to be replicated on any host): strict CSP (`connect-src` api.github.com plus the exchange endpoint once enabled; no inline scripts), `Referrer-Policy`, `X-Content-Type-Options`.
- `VITE_GITHUB_APP_CLIENT_ID` and `VITE_GITHUB_APP_EXCHANGE_URL` build-time config, empty by default; client secret only in the exchange function's secrets.
- CI drops Postgres/Testcontainers and adds axe checks in component and E2E tests, plus a missing-translation-key check.

### Team Dependencies

- None for development.
- Org admins of each organisation used: install the GitHub App, approve fine-grained PATs, or authorise SSO for classic PATs.

### Risks

| Risk                                                               | Likelihood | Impact | Mitigation                                                                                                    |
| ------------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Scope is large (multi-account, detail panel, palette, 3 languages) | High       | Med    | Deliver in phases: (1) PAT, Home, repo pages; (2) detail panel; (3) GitHub App enablement. No fixed deadline. |
| GitHub App sign-in needs a server-side step                        | Certain    | Med    | Stateless exchange/refresh function in a later phase; PAT first; placeholder config now.                      |
| Token in the browser exposed via XSS                               | Low        | High   | Strict CSP, self-hosted assets, no third-party scripts, React escaping, `sessionStorage` by default.          |
| Org blocks PATs or doesn't install the app                         | Med        | Med    | BR-7 explains the cause and fix; other owners keep working.                                                   |
| GraphQL secondary rate limits or search caps                       | Med        | Low    | Sequential queries, `Retry-After` back-off, 5-minute interval, BR-18 budget tests.                            |
| Re-review detection is unreliable                                  | Med        | Low    | Precise definition in Business Rules; table-driven domain tests.                                              |
| Template removal breaks `pnpm verify`                              | Med        | Low    | Update guardrail scripts and dependency-cruiser rules in the same PR as the removal.                          |

### Open Questions

_None._ Hosting resolved: host-agnostic static build, nginx for local development.

---

## Spec Review

> This review is intentionally adversarial. It lists only what needs to change and why.

### Summary

Initial review found the spec not ready: scope had grown with the designs while the estimate, feasibility and the "minimise API calls" goal had not been revisited, core behaviours (section rules, re-requested, "new", stale) were undefined, and the server decision was open. All critical issues, gaps and ambiguities were resolved with the PO in the same session (marked ✅ below). No open questions remain.

### Critical Issues

#### ✅ 1. Auth architecture and v1 sign-in undecided

**Problem:** GitHub App sign-in needs server-side code exchange and 8-hour token refresh; v1 scope, host and refresh flow were unspecified, and BR-3 overstated where tokens go.
**Resolution:** PAT in phase 1. GitHub App built behind the same auth port with placeholder config (`VITE_GITHUB_APP_CLIENT_ID`, `VITE_GITHUB_APP_EXCHANGE_URL`), button disabled until set; a stateless exchange/refresh function in a later phase. BR-3 reworded.

#### ✅ 2. "Minimise API calls" had no measurable budget

**Problem:** The headline requirement was qualitative.
**Resolution:** BR-18 sets budgets (Home ≤ 3 search queries / ≤ 50 points; 1 query per 25 favourites; PR open ≤ 2 GraphQL + 1 REST; < 1,000 points/hour) asserted by fixture-based tests.

#### ✅ 3. Home section rules undefined

**Problem:** No precedence or conditions for the three sections.
**Resolution:** Ordered decision table in Business Rules, mapped to GitHub fields, implemented in `domain/` with table-driven tests.

#### ✅ 4. "Re-requested" and "+N new" undefined

**Problem:** No data source, cost or seen-marker semantics.
**Resolution:** Definitions in Business Rules, using fields already in the Home query; seen markers per account and per device; hidden count when no marker exists.

### Significant Gaps

#### ✅ Sidebar counts for every repo would burn quota

**Resolution:** Live counts only for favourites; full repo list cached 24 h, paginated, manually refreshable (BR-5).

#### ✅ Detail cache missed CI changes

**Resolution:** Cache key `updatedAt` + head SHA; check runs 60 s TTL while pending (BR-14).

#### ✅ Multiple tabs doubled quota use

**Resolution:** Leader tab via `navigator.locks`, followers via `BroadcastChannel`, shared IndexedDB (BR-19).

#### ✅ Feasibility and estimate out of date

**Resolution:** PO decision: no fixed estimate, delivered in phases. Feasibility kept at 5. Raw logs removed from scope, eliminating the logs spike.

#### ✅ PAT and token lifecycle thin

**Resolution:** Expiry warning (7 days), classic `repo` scope warning, per-account "remember me", per-account 401 handling (Business Rules › Tokens).

#### ✅ Pagination and size limits missing

**Resolution:** 50 timeline items with "Load more"; 1,000-result search cap with notice.

#### ✅ Accessibility bar aspirational

**Resolution:** Component-level acceptance criteria in UI/UX Notes, each with a test.

#### ✅ Translation ownership

**Resolution:** English fallback, CI missing-key check, GitHub content never translated; the PO reviews fi/sv strings.

### Ambiguities

- ✅ **Stale** — 14 days without human activity; bot activity ignored.
- ✅ **Waiting longest** — since the review request (reviews) or the last push (your PRs).
- ✅ **Smallest** — lines added + removed.
- ✅ **Home vs favourites refresh** — Home on the same 5-minute cycle, active account only.
- ✅ **Check "error details"** — check-run output and annotations only; raw logs out of scope.
- ✅ **Theme control** — quick light/dark toggle in the header; light/dark/system in Settings.
- ✅ **Strategic Objective** — kept as "High-impact Features and AI" per the PO.

### Unresolved Open Questions

- ✅ Hosting target — host-agnostic static build that runs anywhere; nginx container for local development and the prod-like stack; the exchange function is a portable HTTP handler.
- ✅ GitHub App in v1 or later — later phase, placeholder config now.
- ✅ Check-run output instead of raw logs — accepted; raw logs out of scope.
- ✅ Re-estimate — not required.
