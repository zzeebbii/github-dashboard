import { z } from "zod";

/**
 * `data` of queries/pr-detail.graphql.ts. List nodes are nullable because a partial
 * error nulls the node out; the adapter drops null nodes and reports the error.
 */

const ActorSchema = z.object({ __typename: z.string(), login: z.string().min(1) }).nullable();
const nodes = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node.nullable()) });
const PageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const ReviewStateSchema = z.enum([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);

const TimelineNodeSchema = z.discriminatedUnion("__typename", [
  z.object({
    __typename: z.literal("IssueComment"),
    id: z.string(),
    url: z.string(),
    createdAt: z.string(),
    bodyHTML: z.string(),
    author: ActorSchema,
  }),
  z.object({
    __typename: z.literal("PullRequestReview"),
    id: z.string(),
    url: z.string(),
    state: ReviewStateSchema,
    submittedAt: z.string().nullable(),
    bodyHTML: z.string(),
    author: ActorSchema,
  }),
]);

const TimelineSchema = z.object({
  pageInfo: PageInfoSchema,
  nodes: z.array(TimelineNodeSchema.nullable()),
});
export type TimelineData = z.infer<typeof TimelineSchema>;

const ReviewThreadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string(),
  line: z.number().int().nullable(),
  comments: nodes(
    z.object({
      id: z.string(),
      url: z.string(),
      createdAt: z.string(),
      bodyHTML: z.string(),
      diffHunk: z.string(),
      author: ActorSchema,
    }),
  ),
});

export const RequestedReviewerSchema = z.discriminatedUnion("__typename", [
  z.object({ __typename: z.literal("User"), login: z.string() }),
  z.object({
    __typename: z.literal("Team"),
    slug: z.string(),
    organization: z.object({ login: z.string() }),
  }),
  // Bots and mannequins can be requested too; they carry no fields we select.
  z.object({ __typename: z.enum(["Bot", "Mannequin"]) }),
]);
export type RequestedReviewer = z.infer<typeof RequestedReviewerSchema>;

const PullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  bodyHTML: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
  headRefName: z.string(),
  baseRefName: z.string(),
  mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
  author: ActorSchema,
  labels: nodes(z.object({ name: z.string(), color: z.string() })).nullable(),
  assignees: nodes(z.object({ login: z.string() })),
  milestone: z.object({ title: z.string() }).nullable(),
  reviewRequests: nodes(
    z.object({ requestedReviewer: RequestedReviewerSchema.nullable() }),
  ).nullable(),
  latestReviews: nodes(z.object({ state: ReviewStateSchema, author: ActorSchema })).nullable(),
  reviewThreads: nodes(ReviewThreadSchema),
  timelineItems: TimelineSchema,
});

export const PullRequestDetailDataSchema = z.object({
  repository: z.object({ pullRequest: PullRequestSchema.nullable() }).nullable(),
});
export type PullRequestDetailData = z.infer<typeof PullRequestDetailDataSchema>;

export const TimelinePageDataSchema = z.object({
  repository: z
    .object({ pullRequest: z.object({ timelineItems: TimelineSchema }).nullable() })
    .nullable(),
});
export type TimelinePageData = z.infer<typeof TimelinePageDataSchema>;

const CheckRunSchema = z.object({
  databaseId: z.number().int().nullable(),
  name: z.string(),
  status: z.enum(["COMPLETED", "IN_PROGRESS", "PENDING", "QUEUED", "REQUESTED", "WAITING"]),
  conclusion: z
    .enum([
      "ACTION_REQUIRED",
      "CANCELLED",
      "FAILURE",
      "NEUTRAL",
      "SKIPPED",
      "STALE",
      "STARTUP_FAILURE",
      "SUCCESS",
      "TIMED_OUT",
    ])
    .nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  detailsUrl: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  // Absent or null when GitHub cannot say (the required flag is then omitted).
  isRequired: z.boolean().nullish(),
});

const AnnotationSchema = z.object({
  path: z.string(),
  annotationLevel: z.enum(["FAILURE", "NOTICE", "WARNING"]).nullable(),
  title: z.string().nullable(),
  message: z.string(),
  location: z.object({
    start: z.object({ line: z.number().int() }),
    end: z.object({ line: z.number().int() }),
  }),
});

const CheckSuiteSchema = z.object({
  app: z.object({ name: z.string() }).nullable(),
  checkRuns: nodes(CheckRunSchema).nullable(),
  failing: nodes(
    z.object({
      databaseId: z.number().int().nullable(),
      annotations: nodes(AnnotationSchema).nullable(),
    }),
  ).nullable(),
});

export const PullRequestChecksDataSchema = z.object({
  repository: z
    .object({
      // A non-commit object has no `checkSuites`; an unknown SHA is null.
      object: z.object({ checkSuites: nodes(CheckSuiteSchema).nullish() }).nullable(),
    })
    .nullable(),
});
export type PullRequestChecksData = z.infer<typeof PullRequestChecksDataSchema>;
