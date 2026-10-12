/**
 * @kit/contracts — the API contract of record.
 *
 * RULES (enforced by dependency-cruiser and oxlint):
 *   - Zod is the ONLY permitted dependency.
 *   - No implementation, no I/O, no framework, no utilities.
 *   - Changing an existing schema is a BREAKING API change.
 *
 * This package is consumed by apps/api and apps/web, and is the input to the
 * generated artifacts/openapi.json. It is independently publishable.
 */

export * from "./endpoint.ts";
export * from "./problem.ts";
export * from "./task/task.schema.ts";
export * from "./task/task.endpoints.ts";

import type { AnyEndpoint } from "./endpoint.ts";
import { taskEndpoints } from "./task/task.endpoints.ts";

/** Every endpoint in the API, keyed by operation id. */
export const apiEndpoints = {
  ...taskEndpoints,
} as const;

/**
 * Every endpoint as a flat, structurally-typed list.
 *
 * Use this when iterating (OpenAPI generation, route registration); use
 * `apiEndpoints` when you want one specific endpoint with its precise types.
 */
export const allEndpoints: readonly AnyEndpoint[] = Object.values(apiEndpoints);

export type ApiEndpoints = typeof apiEndpoints;
export type ApiOperationId = keyof ApiEndpoints;

export const API_INFO = {
  title: "Agentic Fullstack Starter Kit API",
  version: "1.0.0",
  description:
    "Reference API for the starter kit. The committed artifacts/openapi.json generated from " +
    "this contract is the language-neutral source of truth for any backend implementation.",
} as const;
