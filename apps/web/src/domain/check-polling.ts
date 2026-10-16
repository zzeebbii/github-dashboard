import type { CheckRun } from "./pr-detail.ts";

/** Check runs refetch at most this often while any is still running (FR-6.5). */
export const CHECK_POLL_MS = 60_000;

/** True while any run is queued, waiting or in progress. */
export function hasPendingChecks(runs: readonly Pick<CheckRun, "status">[]): boolean {
  return runs.some((run) => run.status !== "COMPLETED");
}

/**
 * FR-6.5 / AC-6.2: refetch when a run is still pending and the last fetch is at least
 * 60 s old. Once every run has completed, never: a commit's finished checks do not change.
 */
export function shouldRefetchChecks(
  runs: readonly Pick<CheckRun, "status">[],
  lastFetchedAt: Date,
  now: Date,
): boolean {
  return hasPendingChecks(runs) && now.getTime() - lastFetchedAt.getTime() >= CHECK_POLL_MS;
}
