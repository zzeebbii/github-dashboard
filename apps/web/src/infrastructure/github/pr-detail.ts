import type { GitHubError, GitHubReadPort, GitHubResult } from "../../application/github.ts";
import type {
  CheckAnnotation,
  CheckRun,
  PullRequestDetail,
  PullRequestRef,
  TimelineItem,
  TimelinePage,
} from "../../domain/pr-detail.ts";
import type { Actor, ReviewRequest } from "../../domain/pull-request.ts";
import type { GitHubClient } from "./client.ts";
import {
  PullRequestChecksDocument,
  PullRequestDetailDocument,
  TimelinePageDocument,
} from "./queries/pr-detail.graphql.ts";
import type {
  PullRequestChecksData,
  RequestedReviewer,
  TimelineData,
} from "./schemas/pr-detail.ts";

// GitHub's spelling; a constant keeps no-underscore-dangle quiet, as in errors.ts.
const TYPENAME = "__typename";
type RawActor = { readonly [TYPENAME]: string; readonly login: string } | null;

const NOT_FOUND: GitHubError = { kind: "notFound" };

/** Drops the null nodes a partial error leaves; the error itself is in `partialErrors`. */
const present = <T>(nodes: readonly (T | null)[]): T[] => nodes.filter((n): n is T => n !== null);
export const actor = (raw: RawActor): Actor | null =>
  raw === null ? null : { login: raw.login, typename: raw[TYPENAME] };

function timelinePage(raw: TimelineData): TimelinePage {
  const items = present(raw.nodes).flatMap((node): TimelineItem[] => {
    if (node[TYPENAME] === "IssueComment") {
      const { id, url, createdAt, bodyHTML } = node;
      return [{ kind: "comment", id, url, createdAt, bodyHTML, author: actor(node.author) }];
    }
    // A PENDING review is the viewer's own unsubmitted draft: not part of the conversation.
    if (node.state === "PENDING") return [];
    const { id, url, submittedAt, bodyHTML } = node;
    return [
      {
        kind: "review",
        id,
        url,
        submittedAt,
        bodyHTML,
        state: node.state,
        author: actor(node.author),
      },
    ];
  });
  return {
    items,
    nextCursor: raw.pageInfo.hasNextPage ? raw.pageInfo.endCursor : null,
  };
}

export function reviewRequest(reviewer: RequestedReviewer | null): ReviewRequest[] {
  if (reviewer?.[TYPENAME] === "User") return [{ kind: "user", login: reviewer.login }];
  if (reviewer?.[TYPENAME] === "Team") {
    return [{ kind: "team", team: `${reviewer.organization.login}/${reviewer.slug}` }];
  }
  return [];
}

function checkRuns(data: PullRequestChecksData): CheckRun[] | null {
  const commit = data.repository?.object;
  if (commit === null || commit === undefined) return null;
  return present(commit.checkSuites?.nodes ?? []).flatMap((suite) => {
    const annotations = new Map<number, CheckAnnotation[]>();
    for (const run of present(suite.failing?.nodes ?? [])) {
      if (run.databaseId === null) continue;
      annotations.set(
        run.databaseId,
        present(run.annotations?.nodes ?? []).map((a) => ({
          path: a.path,
          startLine: a.location.start.line,
          endLine: a.location.end.line,
          level: a.annotationLevel,
          title: a.title === "" ? null : a.title,
          message: a.message,
        })),
      );
    }
    return present(suite.checkRuns?.nodes ?? []).map((run) => {
      const mapped: { -readonly [K in keyof CheckRun]: CheckRun[K] } = {
        name: run.name,
        app: suite.app?.name ?? null,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        detailsUrl: run.detailsUrl,
        title: run.title,
        summary: run.summary,
        annotations: (run.databaseId === null ? undefined : annotations.get(run.databaseId)) ?? [],
      };
      // Omitted, not false, when GitHub cannot say (FR-6.3).
      if (typeof run.isRequired === "boolean") mapped.isRequired = run.isRequired;
      return mapped;
    });
  });
}

/** Only the declared variables: a wider `ref` object must not add any. */
const variables = (ref: PullRequestRef) => ({
  owner: ref.owner,
  name: ref.name,
  number: ref.number,
});

/** The PR detail half of the `GitHubReadPort` adapter (FR-6.2, 6.3). */
export function createPullRequestDetailRead(
  client: GitHubClient,
): Pick<GitHubReadPort, "getPullRequest" | "getTimelinePage" | "getCheckRuns"> {
  return {
    async getPullRequest(accountId, ref) {
      const result = await client.graphql(accountId, PullRequestDetailDocument, {
        ...variables(ref),
        after: null,
      });
      if (!result.ok) return result;
      const { partialErrors } = result.value;
      const pr = result.value.data.repository?.pullRequest;
      if (pr === null || pr === undefined)
        return { ok: false, error: partialErrors[0] ?? NOT_FOUND };
      const pullRequest: PullRequestDetail = {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: pr.state,
        isDraft: pr.isDraft,
        bodyHTML: pr.bodyHTML,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        headSha: pr.headRefOid,
        headRef: pr.headRefName,
        baseRef: pr.baseRefName,
        mergeable: pr.mergeable,
        author: actor(pr.author),
        labels: present(pr.labels?.nodes ?? []),
        assignees: present(pr.assignees.nodes).map((a) => a.login),
        milestone: pr.milestone?.title ?? null,
        reviewRequests: present(pr.reviewRequests?.nodes ?? []).flatMap((r) =>
          reviewRequest(r.requestedReviewer),
        ),
        reviews: present(pr.latestReviews?.nodes ?? []).flatMap((r) =>
          r.state === "PENDING" ? [] : [{ state: r.state, author: actor(r.author) }],
        ),
        reviewThreads: present(pr.reviewThreads.nodes).map((t) => ({
          id: t.id,
          isResolved: t.isResolved,
          isOutdated: t.isOutdated,
          path: t.path,
          line: t.line,
          comments: present(t.comments.nodes).map((c) => ({
            id: c.id,
            url: c.url,
            createdAt: c.createdAt,
            bodyHTML: c.bodyHTML,
            diffHunk: c.diffHunk,
            author: actor(c.author),
          })),
        })),
      };
      return {
        ok: true,
        value: { data: { pullRequest, timeline: timelinePage(pr.timelineItems) }, partialErrors },
      };
    },

    async getTimelinePage(accountId, ref, after) {
      const result = await client.graphql(accountId, TimelinePageDocument, {
        ...variables(ref),
        after,
      });
      if (!result.ok) return result;
      const { partialErrors } = result.value;
      const pr = result.value.data.repository?.pullRequest;
      if (pr === null || pr === undefined)
        return { ok: false, error: partialErrors[0] ?? NOT_FOUND };
      return { ok: true, value: { data: timelinePage(pr.timelineItems), partialErrors } };
    },

    async getCheckRuns(accountId, ref, headSha): Promise<GitHubResult<readonly CheckRun[]>> {
      const result = await client.graphql(accountId, PullRequestChecksDocument, {
        ...variables(ref),
        sha: headSha,
      });
      if (!result.ok) return result;
      const { partialErrors } = result.value;
      const runs = checkRuns(result.value.data);
      if (runs === null) return { ok: false, error: partialErrors[0] ?? NOT_FOUND };
      return { ok: true, value: { data: runs, partialErrors } };
    },
  };
}
