# GitHub query costs and the PR list design

Measured on 2026-10-16 with read-only GraphQL queries against public data (`search "is:pr is:open org:vercel"`, `vercel/next.js` `pullRequests`, `nodes(ids:)`), 3 runs each, median wall-clock time. Large monorepo PRs with many checks, so likely heavier than a typical personal set. Run-to-run variance was up to ±40%.

## What limits us

GitHub terminates a GraphQL request after **10 seconds** and a timeout also deducts extra points for the next hour ([rate limits and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)). Points were never the problem: every query below cost 1–3 points. **Time per request is the constraint.**

## Field cost (search, 50 PRs)

| Field group                                                    | Median | Notes                            |
| -------------------------------------------------------------- | ------ | -------------------------------- |
| id, number, updatedAt                                          | 1.25 s | floor                            |
| base row (title, author, labels, dates, head SHA, +/−, counts) | 2.76 s |                                  |
| reviews (decision, latest reviews, requests)                   | 3.93 s | ≈ 0.05 s / PR                    |
| CI via `commits(last:1)…statusCheckRollup`                     | 3.20 s |                                  |
| CI via `PullRequest.statusCheckRollup`                         | 1.44 s | **same data, ~2× faster — use**  |
| `mergeable`                                                    | 1.64 s | cheap; `CONFLICTING` = conflicts |
| `mergeStateStatus`                                             | > 10 s | **timeout; ≈ 0.3 s / PR**        |
| `timelineItems(last:1, itemTypes)`                             | 1.39 s | cheap "last activity"            |
| `timelineItems(since:){totalCount}`                            | 4.33 s | slow — lazy only                 |

Full recommended row at 20 PRs: about 3.3–4 s, 1 point. At 100 PRs it times out.

Re-measured 2026-10-16 with T20's final documents (`gh api graphql` wall clock, so including ~0.3 s of CLI start-up): the row fragment at 20 PRs took 5.6–5.9 s on `org:vercel` and 3.1 s on `org:vitejs`; with the re-review fields 4.2–6.3 s on `org:vercel`; the "+N new" document with 9–10 aliased PRs 0.85–1.3 s. All 1 point. `org:vercel` is the heavy end; 20 stays the page size.

## The list design

- **List queries page at 20** (`first: 20`, cursor pagination). Home uses `search(type: ISSUE)`; repository pages use `repository.pullRequests(states: OPEN, orderBy: UPDATED_AT DESC)`.
- Each row selects every BR-11 field: base fields, `reviewDecision`, `latestReviews(first: 10)`, `reviewRequests(first: 10)`, `PullRequest.statusCheckRollup { state }`, `mergeable`, `comments { totalCount }`, `reviews { totalCount }`, and `lastActivity: timelineItems(last: 1, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW])`.
- **No list query requests `mergeStateStatus`.** If ever needed, fetch it lazily for visible rows with `nodes(ids:)` in batches of ≤ 10, cached by head and base SHA.
- `mergeable` can be `UNKNOWN` while GitHub computes it: show "checking" and let the next refresh fill it in.
- **"+N new" is lazy.** No seen marker → hidden (FR-5.3). `lastActivity` not after the marker → 0, no request. Otherwise one request per 10 such rows, with aliased `repository { pullRequest(number) { timelineItems(since: <marker>, first: 50, itemTypes) } }` blocks, cached by `updatedAt`.
- **Favourites** (`nodes(ids:)`, 25 per batch) carry list fields only (id, number, title, url, draft, author, dates, head SHA): full rows for 25 repositories time out even at 1 PR each. Full rows come from the repository page query.
- FR-5.2's re-review rule needs the head commit date, which is only cheap enough on the "reviewed by me" section's query: only that search adds `commits(last: 1) { committedDate }` and the latest `REVIEW_REQUESTED_EVENT` (measured above); rows of the same PR from the other searches are merged with it by node id.
- Without `mergeStateStatus`, Home's "Ready to merge" (rule 5) reads `mergeable = MERGEABLE`, checks passed or absent, and no review still required (`domain/sections.ts`).

## The PR panel

- **Opening a PR** makes the detail request (PR, description, review threads, first 50 timeline items) and the checks request for its head SHA: 2 GraphQL requests, 1 point each, 0 REST (AC-3.1, AC-6.1). The detail is cached by `updatedAt` and head SHA from the list row, so an unchanged PR reopens with 0 requests. Completed checks of a SHA are never fetched again.
- **A deep link with no list row** (a pasted URL, or a PR outside the loaded list) cannot check the cache without asking GitHub. It makes the same detail request and keys the result by the `updatedAt` and head SHA in the response. There is no separate "head" query, so it is still 2 requests. The lookup runs again each time the panel opens without a row. With a row (the repository list underneath has loaded, from cache or network), the row's key wins.
- **Opened from Home**, the panel stays over Home (a route mask), so no repository list is fetched underneath.
- **`mergeStateStatus` is only requested in the single-PR detail query**, for the Details tab's exact merge state ("Blocked by branch protection", "Behind the base branch"). Measured 2026-10-16, 3 open PRs × 3 runs each: median 0.78 s → 1.26 s on `vercel/next.js` and 0.72 s → 1.10 s on `vitejs/vite`, still 1 point. That is about 0.4 s for one PR, where a list of 50 times out.

## Budget

| Operation             | Requests                                                         | Points        |
| --------------------- | ---------------------------------------------------------------- | ------------- |
| Home refresh          | Σ ⌈section size / 20⌉ (3 if all ≤ 20; ≤ 5 for 60) + 0–1 "+N new" | 1 per request |
| Repository page       | ⌈open PRs / 20⌉, later pages on scroll                           | 1 per request |
| Favourites refresh    | ⌈favourites / 25⌉                                                | 1 per request |
| Open a PR (uncached)  | 2 (detail + checks), deep links included; 0 REST                 | 1 per request |
| Reopen it unchanged   | 0 (opened from a row)                                            | 0             |
| Per hour at 5 minutes | Home 36–60 + "+N new" ≤ 12 + favourites 36                       | ≈ 85–110      |

About 2% of the 5,000-point hourly limit.
