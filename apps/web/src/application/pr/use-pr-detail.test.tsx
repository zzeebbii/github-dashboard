import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createInMemoryGitHub } from "../../../tests/fakes/in-memory-github.ts";
import { testQueryClient } from "../../../tests/render.tsx";
import { toAccountId } from "../../domain/account.ts";
import type { CheckRun, PullRequestDetail, TimelineItem } from "../../domain/pr-detail.ts";
import { GitHubProvider } from "../github-provider.tsx";
import { usePrDetail } from "./use-pr-detail.ts";

const INPUT = {
  accountId: toAccountId(1000001)!,
  ref: { owner: "octo-org", name: "app", number: 7 },
  updatedAt: "2026-10-16T06:00:00Z",
  headSha: "a".repeat(40),
};
const item = (id: string): TimelineItem => ({
  kind: "comment",
  id,
  url: `https://github.com/octo-org/app/pull/7#${id}`,
  author: null,
  createdAt: "2026-10-16T06:00:00Z",
  bodyHTML: "<p>Hi</p>",
});
const PR = { number: 7, title: "Fixture" } as PullRequestDetail;
const RUN = { name: "build", status: "COMPLETED", annotations: [] } as unknown as CheckRun;

describe("usePrDetail", () => {
  it("joins the PR, its timeline pages and its checks, and loads more on demand", async () => {
    const calls: string[] = [];
    const github = createInMemoryGitHub(undefined, {
      getPullRequest: (_account, ref) => {
        calls.push(`pr ${ref.number}`);
        const timeline = { items: [item("a")], nextCursor: "c1" };
        return Promise.resolve({
          ok: true,
          value: { data: { pullRequest: PR, timeline }, partialErrors: [] },
        });
      },
      getTimelinePage: (_account, _ref, after) => {
        calls.push(`page ${after}`);
        const page = { items: [item("b")], nextCursor: null };
        return Promise.resolve({ ok: true, value: { data: page, partialErrors: [] } });
      },
      getCheckRuns: (_account, _ref, sha) => {
        calls.push(`checks ${sha.slice(0, 1)}`);
        return Promise.resolve({ ok: true, value: { data: [RUN], partialErrors: [] } });
      },
    });
    const client = testQueryClient();

    const { result } = await renderHook(() => usePrDetail(INPUT), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          <GitHubProvider github={github}>{children}</GitHubProvider>
        </QueryClientProvider>
      ),
    });

    await expect.poll(() => result.current.pullRequest?.title).toBe("Fixture");
    await expect.poll(() => result.current.checks.data).toEqual([RUN]);
    expect(result.current.hasMore).toBe(true);
    result.current.loadMore();
    await expect.poll(() => result.current.timeline.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.current.hasMore).toBe(false);
    result.current.loadMore();
    expect(calls.toSorted()).toEqual(["checks a", "page c1", "pr 7"]);
  });
});
