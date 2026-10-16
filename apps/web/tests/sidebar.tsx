import { beforeAll } from "vitest";
import { page } from "vitest/browser";
import type { GitHubError, OrgAccessIssue } from "../src/application/github.ts";
import { type Account, toAccountId } from "../src/domain/account.ts";
import type { Favourite, FavouriteLookup, Repository } from "../src/domain/favourites.ts";
import styles from "../src/styles.css?inline";
import { createInMemoryAccountStore } from "./fakes/in-memory-account-store.ts";
import { createInMemoryGitHub } from "./fakes/in-memory-github.ts";
import { renderApp } from "./render.tsx";

/** The real stylesheet: the drawer breakpoint and contrast depend on it. */
export function loadRealStyles(): void {
  beforeAll(() => {
    const sheet = document.createElement("style");
    sheet.textContent = styles;
    document.head.append(sheet);
  });
}

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-fixture",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: true,
};

const repo = (nameWithOwner: string): Repository => ({
  id: `R_${nameWithOwner}`,
  nameWithOwner,
  visibility: "PUBLIC",
  description: null,
});

export const favourite = (nameWithOwner: string): Favourite => ({
  nodeId: `R_${nameWithOwner}`,
  nameWithOwner,
});

export const ssoIssue = (org: string): OrgAccessIssue => ({
  org,
  reason: "sso",
  fixUrl: `https://github.com/orgs/${org}/sso`,
});

interface SidebarOptions {
  readonly repositories?: readonly string[];
  readonly favourites?: readonly Favourite[];
  /** Open PR counts by node id; an id missing here no longer resolves (unavailable). */
  readonly openCounts?: Readonly<Record<string, number>>;
  readonly orgIssues?: readonly OrgAccessIssue[];
  readonly width?: number;
}

/**
 * The real app at `/` for a signed-in account, with GitHub answering from memory and
 * counting what it was asked, so a test can prove typing asks GitHub nothing.
 */
export async function renderSidebar({
  repositories = [],
  favourites = [],
  openCounts = {},
  orgIssues = [],
  width = 1280,
}: SidebarOptions = {}) {
  await page.viewport(width, 800);
  const accountStore = createInMemoryAccountStore([ACCOUNT]);
  accountStore.setActive(ACCOUNT.id);
  accountStore.setFavourites(ACCOUNT.id, favourites);
  const calls = { listRepos: 0, refreshFavourites: 0 };
  const github = createInMemoryGitHub(undefined, {
    listRepos: () => {
      calls.listRepos += 1;
      const partialErrors = orgIssues.map((issue): GitHubError => ({ kind: "orgAccess", issue }));
      return Promise.resolve({
        ok: true,
        value: { data: repositories.map(repo), partialErrors },
      });
    },
    refreshFavourites: (_accountId, nodeIds) => {
      calls.refreshFavourites += 1;
      const data = nodeIds.map((nodeId): FavouriteLookup => {
        const openCount = openCounts[nodeId];
        return openCount === undefined
          ? { kind: "missing", nodeId }
          : { kind: "found", nodeId, nameWithOwner: nodeId.slice(2), openCount, pullRequests: [] };
      });
      return Promise.resolve({ ok: true, value: { data, partialErrors: [] } });
    },
  });
  const app = await renderApp("/", { accountStore, hasAccount: true, github });
  return { ...app, calls, accountStore, accountId: ACCOUNT.id };
}
