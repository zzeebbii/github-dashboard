import type { GitHubReadPort, GitHubResult, Viewer } from "../../src/application/github.ts";

const notFound = () => Promise.resolve({ ok: false, error: { kind: "notFound" } } as const);

/**
 * A `GitHubReadPort` with no network: answers `viewer` with the given result, the PR
 * detail calls with `notFound`, no repositories, no favourites and empty Home searches,
 * unless `overrides` answers them.
 */
export function createInMemoryGitHub(
  viewer: GitHubResult<Viewer> = {
    ok: true,
    value: {
      data: { login: "octo-fixture", name: null, avatarUrl: "", organizations: [] },
      partialErrors: [],
    },
  },
  overrides: Partial<GitHubReadPort> = {},
): GitHubReadPort {
  return {
    viewer: () => Promise.resolve(viewer),
    getPullRequest: notFound,
    getTimelinePage: notFound,
    getCheckRuns: notFound,
    listRepos: () => Promise.resolve({ ok: true, value: { data: [], partialErrors: [] } }),
    refreshFavourites: (_accountId, nodeIds) =>
      Promise.resolve({
        ok: true,
        value: { data: nodeIds.map((nodeId) => ({ kind: "missing", nodeId })), partialErrors: [] },
      }),
    searchHome: () =>
      Promise.resolve({
        ok: true,
        value: { data: { pullRequests: [], nextCursor: null, totalCount: 0 }, partialErrors: [] },
      }),
    getActivitySince: (_accountId, requests) =>
      Promise.resolve({ ok: true, value: { data: requests.map(() => []), partialErrors: [] } }),
    ...overrides,
  };
}
