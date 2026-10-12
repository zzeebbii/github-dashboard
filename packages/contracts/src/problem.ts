import { z } from "zod";

/**
 * RFC 9457 "Problem Details for HTTP APIs".
 *
 * One error shape for the entire API. Chosen once, here, so that neither humans
 * nor agents invent a second convention. See docs/conventions/error-handling.md.
 */

export const ProblemTypes = {
  validation: "https://kit.example/problems/validation-failed",
  notFound: "https://kit.example/problems/not-found",
  conflict: "https://kit.example/problems/conflict",
  internal: "https://kit.example/problems/internal-error",
} as const;

export type ProblemType = (typeof ProblemTypes)[keyof typeof ProblemTypes];

/** One field-level validation failure, so clients can attach errors to inputs. */
export const ValidationIssueSchema = z.object({
  /** JSON Pointer to the offending field, e.g. "/title". */
  pointer: z.string(),
  message: z.string(),
});

export const ProblemSchema = z.object({
  type: z.string().describe("A URI identifying the problem type."),
  title: z.string().describe("A short, human-readable summary, stable per type."),
  status: z.int().min(400).max(599),
  detail: z.string().describe("A human-readable explanation specific to this occurrence."),
  instance: z.string().optional().describe("A URI identifying this specific occurrence."),
  errors: z.array(ValidationIssueSchema).optional().describe("Field-level validation failures."),
});

export type Problem = z.infer<typeof ProblemSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
