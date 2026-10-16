/**
 * An expected failure as a value (ADR-0020). Exceptions are only for bugs.
 *
 * This file has ZERO imports.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
