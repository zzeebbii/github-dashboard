import { z } from "zod";

/**
 * `data` of queries/repos.graphql.ts. An organisation node, and its repository page, are
 * nullable because a partial error (SSO, token policy) nulls them out.
 */

const RepositorySchema = z.object({
  id: z.string().min(1),
  nameWithOwner: z.string().regex(/^[^/]+\/[^/]+$/),
  visibility: z.enum(["PUBLIC", "PRIVATE", "INTERNAL"]),
  description: z.string().nullable(),
});

const PageSchema = z.object({
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  nodes: z.array(RepositorySchema.nullable()),
});
export type RepositoryPage = z.infer<typeof PageSchema>;

const OrganizationSchema = z.object({
  login: z.string().min(1),
  repositories: PageSchema.nullable(),
});

export const RepositoriesDataSchema = z.object({
  viewer: z.object({
    repositories: PageSchema,
    organizations: z.object({ nodes: z.array(OrganizationSchema.nullable()) }),
  }),
});
export type RepositoriesData = z.infer<typeof RepositoriesDataSchema>;

export const ViewerRepositoriesDataSchema = z.object({
  viewer: z.object({ repositories: PageSchema }),
});
export type ViewerRepositoriesData = z.infer<typeof ViewerRepositoriesDataSchema>;

export const OrganizationRepositoriesDataSchema = z.object({
  organization: OrganizationSchema.nullable(),
});
export type OrganizationRepositoriesData = z.infer<typeof OrganizationRepositoriesDataSchema>;
