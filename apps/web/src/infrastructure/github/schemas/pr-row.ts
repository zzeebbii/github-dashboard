import { z } from "zod";
import { RequestedReviewerSchema } from "./pr-detail.ts";

/**
 * The `PrRow` fragment (queries/pr-row.fragment.ts), plus the optional re-review fields,
 * and the documents built on it. List nodes are nullable: a partial error nulls a node out.
 */

const ActorSchema = z.object({ __typename: z.string(), login: z.string().min(1) }).nullable();
const nodes = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node.nullable()) });
const PageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

/** A comment or review, as the row's `lastActivity` and the activity-since query return it. */
const ActivityNodeSchema = z.discriminatedUnion("__typename", [
  z.object({ __typename: z.literal("IssueComment"), createdAt: z.string(), author: ActorSchema }),
  z.object({
    __typename: z.literal("PullRequestReview"),
    createdAt: z.string(),
    author: ActorSchema,
  }),
]);
export type ActivityNode = z.infer<typeof ActivityNodeSchema>;

const PrRowSchema = z.object({
  __typename: z.literal("PullRequest"),
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  repository: z.object({ nameWithOwner: z.string().regex(/^[^/]+\/[^/]+$/) }),
  author: ActorSchema,
  labels: nodes(z.object({ name: z.string() })).nullable(),
  reviewDecision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"]).nullable(),
  mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
  statusCheckRollup: z
    .object({ state: z.enum(["SUCCESS", "FAILURE", "ERROR", "PENDING", "EXPECTED"]) })
    .nullable(),
  comments: z.object({ totalCount: z.number().int().nonnegative() }),
  reviews: z.object({ totalCount: z.number().int().nonnegative() }).nullable(),
  latestReviews: nodes(
    z.object({
      state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]),
      submittedAt: z.string().nullable(),
      author: ActorSchema,
    }),
  ).nullable(),
  reviewRequests: nodes(
    z.object({ requestedReviewer: RequestedReviewerSchema.nullable() }),
  ).nullable(),
  lastActivity: nodes(ActivityNodeSchema),
  // Only in the "reviewed by me" search (REREVIEW_FIELDS).
  commits: nodes(z.object({ commit: z.object({ committedDate: z.string() }) })).optional(),
  lastRequest: nodes(
    z.object({
      createdAt: z.string(),
      // A team, bot or mannequin carries only its `__typename`.
      requestedReviewer: z
        .object({ __typename: z.string(), login: z.string().optional() })
        .nullable(),
    }),
  ).optional(),
});
export type PrRow = z.infer<typeof PrRowSchema>;

/** A search node: a pull request, or (never for `is:pr`, but typed so) anything else. */
const SearchNodeSchema = z.union([
  PrRowSchema,
  z.object({ __typename: z.string().refine((name) => name !== "PullRequest") }),
]);

export const PrSearchDataSchema = z.object({
  search: z.object({
    issueCount: z.number().int().nonnegative(),
    pageInfo: PageInfoSchema,
    nodes: z.array(SearchNodeSchema.nullable()),
  }),
});
export type PrSearchData = z.infer<typeof PrSearchDataSchema>;

/** One aliased block of the activity-since document. */
export const ActivitySinceBlockSchema = z
  .object({
    pullRequest: z.object({ id: z.string(), timelineItems: nodes(ActivityNodeSchema) }).nullable(),
  })
  .nullable();
