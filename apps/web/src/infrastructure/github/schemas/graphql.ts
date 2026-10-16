import { z } from "zod";

/** What every GraphQL response shares, before the document's own `data` schema runs. */

const GraphQLErrorSchema = z.object({
  type: z.string().optional(),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
});
export type GraphQLErrorEntry = z.infer<typeof GraphQLErrorSchema>;

export const GraphQLEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(GraphQLErrorSchema).optional(),
});

/** Every document selects `rateLimit { cost limit remaining resetAt }` (FR-3.4). */
export const RateLimitFieldSchema = z.object({
  rateLimit: z.object({
    cost: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    resetAt: z.string(),
  }),
});

/** REST error bodies: `{ "message": "…", "documentation_url": "…" }`. */
export const RestErrorSchema = z.object({ message: z.string() });
