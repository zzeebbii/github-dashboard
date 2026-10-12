import { ProblemTypes, type Problem, type ValidationIssue } from "@kit/contracts";
import type { AppError } from "../application/errors.ts";

/**
 * Maps transport-agnostic application errors onto RFC 9457 problem documents.
 *
 * This mapping lives in the HTTP layer on purpose: use cases must not know what
 * a 404 is. Swapping HTTP for a queue would replace this file and nothing else.
 */

/**
 * The exact set of problem statuses this API emits.
 *
 * Typed as a union rather than `number` so handing it to Hono needs no cast —
 * adding a new status here is a deliberate, type-checked decision.
 */
type ProblemStatus = 400 | 404 | 409 | 500;

export interface ProblemResponse {
  readonly status: ProblemStatus;
  readonly body: Problem;
}

export function toProblem(error: AppError, instance?: string): ProblemResponse {
  switch (error.kind) {
    case "NotFound":
      return {
        status: 404,
        body: {
          type: ProblemTypes.notFound,
          title: "Resource not found",
          status: 404,
          detail: `${error.resource} with id "${error.id}" does not exist.`,
          ...(instance === undefined ? {} : { instance }),
        },
      };

    case "Validation":
      return {
        status: 400,
        body: {
          type: ProblemTypes.validation,
          title: "Validation failed",
          status: 400,
          detail: "The request body or parameters did not satisfy the API contract.",
          errors: [...error.issues],
          ...(instance === undefined ? {} : { instance }),
        },
      };

    case "Conflict":
      return {
        status: 409,
        body: {
          type: ProblemTypes.conflict,
          title: "Conflict",
          status: 409,
          detail: error.reason,
          ...(instance === undefined ? {} : { instance }),
        },
      };
    default: {
      // Adding an AppError kind without mapping it here is a compile error.
      const unhandled: never = error;
      throw new Error(`Unhandled AppError: ${JSON.stringify(unhandled)}`);
    }
  }
}

export function validationProblem(
  issues: readonly ValidationIssue[],
  instance?: string,
): ProblemResponse {
  return {
    status: 400,
    body: {
      type: ProblemTypes.validation,
      title: "Validation failed",
      status: 400,
      detail: "The request body or parameters did not satisfy the API contract.",
      errors: [...issues],
      ...(instance === undefined ? {} : { instance }),
    },
  };
}

/**
 * The catch-all. Deliberately leaks nothing: internal messages and stack traces
 * stay in the logs, never in the response body.
 */
export function internalProblem(instance?: string): ProblemResponse {
  return {
    status: 500,
    body: {
      type: ProblemTypes.internal,
      title: "Internal server error",
      status: 500,
      detail: "An unexpected error occurred. The incident has been logged.",
      ...(instance === undefined ? {} : { instance }),
    },
  };
}
