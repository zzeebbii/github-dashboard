import type { GitHubReadPort, GitHubResult, Viewer } from "../../src/application/github.ts";

/** A `GitHubReadPort` with no network: answers every call with the given result. */
export function createInMemoryGitHub(
  viewer: GitHubResult<Viewer> = {
    ok: true,
    value: {
      data: { login: "octo-fixture", name: null, avatarUrl: "", organizations: [] },
      partialErrors: [],
    },
  },
): GitHubReadPort {
  return { viewer: () => Promise.resolve(viewer) };
}
