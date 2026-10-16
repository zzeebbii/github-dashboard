import { z } from "zod";

/**
 * `data` of queries/favourites.graphql.ts. A node is null when its id no longer resolves
 * (NOT_FOUND) or a partial error hid it; a node of another type has only `__typename`.
 */

const PullRequestSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  headRefOid: z.string().regex(/^[0-9a-f]{40}$/),
  author: z.object({ __typename: z.string(), login: z.string().min(1) }).nullable(),
});

const RepositoryNodeSchema = z.object({
  __typename: z.literal("Repository"),
  id: z.string().min(1),
  nameWithOwner: z.string().regex(/^[^/]+\/[^/]+$/),
  pullRequests: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(PullRequestSchema.nullable()),
  }),
});
export type RepositoryNode = z.infer<typeof RepositoryNodeSchema>;

const NodeSchema = z.union([
  RepositoryNodeSchema,
  // Another type of node: the id now names something that is not a repository.
  z.object({ __typename: z.string().refine((name) => name !== "Repository") }),
]);

export const FavouritesDataSchema = z.object({ nodes: z.array(NodeSchema.nullable()) });
export type FavouritesData = z.infer<typeof FavouritesDataSchema>;
