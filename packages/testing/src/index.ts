/**
 * @kit/testing — shared test fixtures and factories.
 *
 * Depends on @kit/contracts only. It must never depend on an app, because both
 * apps consume it; an app dependency here would create a backdoor between them.
 *
 * Factories produce values that satisfy the CONTRACT, so a fixture that drifts
 * from the API shape fails to typecheck.
 */

export * from "./factories.ts";
export * from "./determinism.ts";
