import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { createInMemoryGitHub } from "../../../tests/fakes/in-memory-github.ts";
import { testQueryClient } from "../../../tests/render.tsx";
import { type Account, toAccountId } from "../../domain/account.ts";
import type { FavouriteLookup } from "../../domain/favourites.ts";
import type { AccountStore } from "../accounts.ts";
import { AuthProvider } from "../auth-provider.tsx";
import type { GitHubReadPort } from "../github.ts";
import { GitHubProvider } from "../github-provider.tsx";
import { useFavourites } from "./use-favourites.ts";
import { useRepos } from "./use-repos.ts";

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-fixture",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: true,
};
const SSO = {
  kind: "orgAccess",
  issue: { org: "sso-corp", reason: "sso", fixUrl: "https://github.com/orgs/sso-corp/sso" },
} as const;

/** GitHub as the test describes it: each id resolves to a name, or to nothing. */
function gitHub(names: Record<string, string | null>, asked: string[][] = []): GitHubReadPort {
  return createInMemoryGitHub(undefined, {
    refreshFavourites: (_accountId, nodeIds) => {
      asked.push([...nodeIds]);
      const data = nodeIds.map((nodeId): FavouriteLookup => {
        const name = names[nodeId];
        return name === null || name === undefined
          ? { kind: "missing", nodeId }
          : { kind: "found", nodeId, nameWithOwner: name, openCount: 1, pullRequests: [] };
      });
      return Promise.resolve({ ok: true, value: { data, partialErrors: [] } });
    },
    listRepos: () =>
      Promise.resolve({
        ok: true,
        value: {
          data: [{ id: "R_1", nameWithOwner: "acme/app", visibility: "PUBLIC", description: null }],
          partialErrors: [SSO],
        },
      }),
  });
}

function wrapper(github: GitHubReadPort, store: AccountStore) {
  const client = testQueryClient();
  const auth = createInMemoryAuth(store, {});
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider auth={auth} accountStore={store}>
        <GitHubProvider github={github}>{children}</GitHubProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("useFavourites", () => {
  it("adds a favourite and refreshes it at once; un-favouriting removes it (AC-4.3)", async () => {
    const store = createInMemoryAccountStore([ACCOUNT]);
    const asked: string[][] = [];
    const { result } = await renderHook(() => useFavourites(ACCOUNT.id), {
      wrapper: wrapper(gitHub({ R_1: "acme/app" }, asked), store),
    });

    result.current.toggle({ id: "R_1", nameWithOwner: "acme/app" });

    await expect.poll(() => result.current.statuses[0]?.state).toBe("available");
    expect(store.favourites(ACCOUNT.id)).toEqual([{ nodeId: "R_1", nameWithOwner: "acme/app" }]);
    expect(result.current.isFavourite("R_1")).toBe(true);
    expect(asked).toEqual([["R_1"]]);

    result.current.toggle({ id: "R_1", nameWithOwner: "acme/app" });
    await expect.poll(() => result.current.statuses).toEqual([]);
    expect(store.favourites(ACCOUNT.id)).toEqual([]);
  });

  it("saves a rename silently and marks a vanished favourite unavailable (AC-4.4)", async () => {
    const store = createInMemoryAccountStore([ACCOUNT]);
    store.setFavourites(ACCOUNT.id, [
      { nodeId: "R_1", nameWithOwner: "acme/old-name" },
      { nodeId: "R_2", nameWithOwner: "acme/deleted" },
    ]);
    const { result } = await renderHook(() => useFavourites(ACCOUNT.id), {
      wrapper: wrapper(gitHub({ R_1: "acme/new-name", R_2: null }), store),
    });

    await expect
      .poll(() => store.favourites(ACCOUNT.id).map((f) => f.nameWithOwner))
      .toEqual(["acme/new-name", "acme/deleted"]);
    expect(result.current.statuses.map((s) => s.state)).toEqual(["available", "unavailable"]);

    result.current.remove("R_2");
    await expect.poll(() => store.favourites(ACCOUNT.id)).toHaveLength(1);
  });

  it("flags the refresh-cost notice above 50 favourites (FR-4.8)", async () => {
    const store = createInMemoryAccountStore([ACCOUNT]);
    store.setFavourites(
      ACCOUNT.id,
      Array.from({ length: 51 }, (_, i) => ({ nodeId: `R_${i}`, nameWithOwner: `acme/r-${i}` })),
    );
    const asked: string[][] = [];
    const { result } = await renderHook(() => useFavourites(ACCOUNT.id), {
      wrapper: wrapper(gitHub({}, asked), store),
    });

    expect(result.current.showCostNotice).toBe(true);
    await expect
      .poll(() => asked.map((ids) => ids.length).toSorted((a, b) => a - b))
      .toEqual([1, 25, 25]);
  });
});

describe("useRepos", () => {
  it("lists the repositories and the organisations GitHub would not show", async () => {
    const store = createInMemoryAccountStore([ACCOUNT]);
    const { result } = await renderHook(() => useRepos(ACCOUNT.id), {
      wrapper: wrapper(gitHub({}), store),
    });

    await expect
      .poll(() => result.current.repositories.map((r) => r.nameWithOwner))
      .toEqual(["acme/app"]);
    expect(result.current.orgAccessIssues).toEqual([SSO.issue]);
    result.current.refresh();
  });
});
