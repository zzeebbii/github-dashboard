import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { isStale } from "../domain/activity.ts";
import { type PullRequest, toMillis } from "../domain/pull-request.ts";
import { type SortKey, sortPullRequests } from "../domain/sort.ts";

/**
 * The PR list's filter and sort state (FR-5.7). It lives in the URL search params, so it
 * survives a reload and can be shared (AC-5.5); only non-default fields are written.
 */

export const updatedWindows = ["any", "24h", "7d", "30d", "stale"] as const;
type UpdatedWindow = (typeof updatedWindows)[number];

export const sortKeys = [
  "waiting",
  "updated",
  "newest",
  "smallest",
] as const satisfies readonly SortKey[];

export interface PrFilters {
  /** Matches title, repository, author and `#number`. */
  readonly q: string;
  /** A PR matches when it has any of these labels. Empty: no label filter. */
  readonly label: readonly string[];
  readonly updated: UpdatedWindow;
  /** false hides drafts. */
  readonly drafts: boolean;
  readonly sort: SortKey;
}

export const defaultPrFilters: PrFilters = Object.freeze({
  q: "",
  label: [],
  updated: "any",
  drafts: true,
  sort: "waiting",
});

// The router JSON-parses each param, so a hand-typed `?q=123` arrives as a number and
// `?label=bug` as a single string. Both are accepted. Each field falls back on its own, so
// one bad param never discards the others.
const searchSchema = z.object({
  q: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().max(200))
    .catch(defaultPrFilters.q),
  label: z
    .union([z.string().transform((label) => [label]), z.array(z.string())])
    .pipe(z.array(z.string().max(100)).max(50))
    .catch([]),
  updated: z.enum(updatedWindows).catch(defaultPrFilters.updated),
  drafts: z.boolean().catch(defaultPrFilters.drafts),
  sort: z.enum(sortKeys).catch(defaultPrFilters.sort),
});

/** Parses raw search params. Usable as a route's `validateSearch`. Never throws. */
export function parsePrFilters(search: unknown): PrFilters {
  const record = typeof search === "object" && search !== null ? search : {};
  return searchSchema.parse(record);
}

/** The search params to write: only the fields that differ from the defaults. */
export function toPrFilterSearch(filters: PrFilters): Partial<PrFilters> {
  const search: { -readonly [K in keyof PrFilters]?: PrFilters[K] } = {};
  if (filters.q !== defaultPrFilters.q) search.q = filters.q;
  if (filters.label.length > 0) search.label = filters.label;
  if (filters.updated !== defaultPrFilters.updated) search.updated = filters.updated;
  if (filters.drafts !== defaultPrFilters.drafts) search.drafts = filters.drafts;
  if (filters.sort !== defaultPrFilters.sort) search.sort = filters.sort;
  return search;
}

/** True when any field differs from the defaults: "Reset" has something to do. */
export function hasActivePrFilters(filters: PrFilters): boolean {
  return Object.keys(toPrFilterSearch(filters)).length > 0;
}

const HOUR_MS = 60 * 60 * 1000;
const windowHours: Record<"24h" | "7d" | "30d", number> = { "24h": 24, "7d": 168, "30d": 720 };

function matchesUpdated(pr: PullRequest, updated: UpdatedWindow, now: Date): boolean {
  if (updated === "any") return true;
  if (updated === "stale") return isStale(pr, now);
  return now.getTime() - toMillis(pr.updatedAt) <= windowHours[updated] * HOUR_MS;
}

function matchesText(pr: PullRequest, query: string): boolean {
  if (query === "") return true;
  return [pr.title, pr.repository, pr.author?.login ?? "", `#${pr.number}`].some((field) =>
    field.toLowerCase().includes(query),
  );
}

/** Filters, then sorts with T18's rules. Pure: `now` and the viewer are passed in. */
export function applyPrFilters(
  prs: readonly PullRequest[],
  filters: PrFilters,
  { viewerLogin, now }: { readonly viewerLogin: string; readonly now: Date },
): PullRequest[] {
  const query = filters.q.trim().toLowerCase();
  const kept = prs.filter(
    (pr) =>
      matchesText(pr, query) &&
      (filters.label.length === 0 || pr.labels.some((l) => filters.label.includes(l))) &&
      matchesUpdated(pr, filters.updated, now) &&
      (filters.drafts || !pr.isDraft),
  );
  return sortPullRequests(kept, filters.sort, viewerLogin);
}

/**
 * The current route's filters, plus setters that write them back to the URL. Replaces the
 * history entry, so typing in the filter box does not fill Back with keystrokes.
 */
export function usePrFilters() {
  const filters = parsePrFilters(useSearch({ strict: false }));
  const router = useRouter();
  const { pathname } = useLocation();
  // By `href`: no route declares these params yet (T20/T21 will), so a typed `search` would not compile.
  const write = (next: PrFilters) => {
    const href = pathname + router.options.stringifySearch(toPrFilterSearch(next));
    void router.navigate({ href, replace: true });
  };
  return {
    filters,
    update: (patch: Partial<PrFilters>) => write({ ...filters, ...patch }),
    reset: () => write(defaultPrFilters),
  };
}
