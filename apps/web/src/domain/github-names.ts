import type { Result } from "./result.ts";

/**
 * GitHub name rules (FR-3.14). Route and search params pass through these before they
 * become GraphQL variables; an invalid value renders not-found without a request.
 */

export type NameError = "invalid-owner" | "invalid-repo" | "invalid-number";

// A user or organisation login: letters, digits and hyphens, at most 39 characters.
const OWNER = /^[A-Za-z0-9-]{1,39}$/;
// A repository name: letters, digits, ".", "_" and "-", at most 100 characters.
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
// GraphQL `Int` is 32-bit, so a larger pull request number cannot exist.
const MAX_INT = 2_147_483_647;

export function parseOwner(value: string): Result<string, NameError> {
  return OWNER.test(value) ? { ok: true, value } : { ok: false, error: "invalid-owner" };
}

export function parseRepoName(value: string): Result<string, NameError> {
  // "." and ".." match the pattern but GitHub reserves them.
  return REPO.test(value) && value !== "." && value !== ".."
    ? { ok: true, value }
    : { ok: false, error: "invalid-repo" };
}

/** A positive decimal integer with no sign, leading zero or trailing junk ("1x"). */
export function parsePullNumber(value: string): Result<number, NameError> {
  const number = Number(value);
  return /^[1-9]\d*$/.test(value) && number <= MAX_INT
    ? { ok: true, value: number }
    : { ok: false, error: "invalid-number" };
}
