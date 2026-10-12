import type { TaskValidationError } from "../domain/task/task.ts";

/**
 * The application's error vocabulary.
 *
 * These are transport-agnostic on purpose: nothing here mentions HTTP status
 * codes. The HTTP layer maps them to RFC 9457 problems, so swapping HTTP for a
 * queue or gRPC would not touch a single use case.
 */

export type AppError =
  | { readonly kind: "NotFound"; readonly resource: string; readonly id: string }
  | { readonly kind: "Validation"; readonly issues: readonly ValidationIssue[] }
  | { readonly kind: "Conflict"; readonly reason: string };

interface ValidationIssue {
  readonly pointer: string;
  readonly message: string;
}

export function notFound(resource: string, id: string): AppError {
  return { kind: "NotFound", resource, id };
}

function validation(issues: readonly ValidationIssue[]): AppError {
  return { kind: "Validation", issues };
}

/** Translates a domain rule violation into an application-level validation error. */
export function fromTaskValidationError(error: TaskValidationError, pointer = "/title"): AppError {
  switch (error.kind) {
    case "TitleEmpty":
      return validation([{ pointer, message: "Title must not be empty." }]);
    case "TitleTooLong":
      return validation([
        {
          pointer,
          message: `Title must be at most ${error.maxLength} characters (received ${error.actualLength}).`,
        },
      ]);
    default: {
      // Compile-time exhaustiveness: adding a new TaskValidationError kind
      // without handling it here becomes a type error, not a silent undefined.
      const unhandled: never = error;
      throw new Error(`Unhandled TaskValidationError: ${JSON.stringify(unhandled)}`);
    }
  }
}
