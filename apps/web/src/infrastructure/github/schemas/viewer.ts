import { z } from "zod";

/**
 * `data` of queries/viewer.graphql.ts. Organisation nodes and their team connections are
 * nullable because a partial error (SSO, unapproved token) nulls them out.
 */
export const ViewerDataSchema = z.object({
  viewer: z.object({
    login: z.string().min(1),
    name: z.string().nullable(),
    avatarUrl: z.string(),
    organizations: z.object({
      nodes: z.array(
        z
          .object({
            login: z.string().min(1),
            name: z.string().nullable(),
            avatarUrl: z.string(),
            teams: z
              .object({ nodes: z.array(z.object({ slug: z.string() }).nullable()) })
              .nullable(),
          })
          .nullable(),
      ),
    }),
  }),
});
export type ViewerData = z.infer<typeof ViewerDataSchema>;
