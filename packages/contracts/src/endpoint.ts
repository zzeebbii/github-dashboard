import type { z } from "zod";

/**
 * A framework-neutral description of one HTTP endpoint.
 *
 * This deliberately does NOT use Hono's `createRoute`, because importing
 * `@hono/zod-openapi` here would couple the contract to a TypeScript backend
 * and break the replaceability guarantee. Instead the backend adapts these
 * descriptors into Hono routes, and the frontend adapts them into requests.
 * A .NET or Go backend ignores this file entirely and implements the emitted
 * openapi.json instead.
 */

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface EndpointDefinition<
  TPath extends string = string,
  TParams extends z.ZodType | undefined = z.ZodType | undefined,
  TQuery extends z.ZodType | undefined = z.ZodType | undefined,
  TBody extends z.ZodType | undefined = z.ZodType | undefined,
  TResponses extends Record<number, z.ZodType> = Record<number, z.ZodType>,
> {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: TPath;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly params: TParams;
  readonly query: TQuery;
  readonly body: TBody;
  readonly responses: TResponses;
  /** The status code returned on success. Used by clients to pick the response schema. */
  readonly successStatus: keyof TResponses & number;
}

export function defineEndpoint<
  const TPath extends string,
  TParams extends z.ZodType | undefined,
  TQuery extends z.ZodType | undefined,
  TBody extends z.ZodType | undefined,
  TResponses extends Record<number, z.ZodType>,
>(
  definition: EndpointDefinition<TPath, TParams, TQuery, TBody, TResponses>,
): EndpointDefinition<TPath, TParams, TQuery, TBody, TResponses> {
  return definition;
}

/**
 * A widened, non-generic view of any endpoint.
 *
 * `EndpointDefinition` is invariant in its response map (because `successStatus`
 * uses `keyof TResponses`), so a union of concrete endpoints is not assignable to
 * the generic form. Consumers that iterate over every endpoint — the OpenAPI
 * generator, route registration — want this structural view instead. Widening
 * happens once, here, rather than as a cast at every call site.
 */
export interface AnyEndpoint {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly params: z.ZodType | undefined;
  readonly query: z.ZodType | undefined;
  readonly body: z.ZodType | undefined;
  readonly responses: Readonly<Record<number, z.ZodType>>;
  readonly successStatus: number;
}

/** The parsed success-response type of an endpoint. */
export type ResponseOf<E extends EndpointDefinition> = z.infer<E["responses"][E["successStatus"]]>;

/** The request-body type of an endpoint, or `undefined` when it takes no body. */
export type BodyOf<E extends EndpointDefinition> = E["body"] extends z.ZodType
  ? z.infer<E["body"]>
  : undefined;

/** The path-parameter type of an endpoint, or `undefined` when it has none. */
export type ParamsOf<E extends EndpointDefinition> = E["params"] extends z.ZodType
  ? z.infer<E["params"]>
  : undefined;

/** The query-parameter type of an endpoint, or `undefined` when it has none. */
export type QueryOf<E extends EndpointDefinition> = E["query"] extends z.ZodType
  ? z.infer<E["query"]>
  : undefined;

/**
 * Substitutes `:param` placeholders in an endpoint path.
 * Values are URL-encoded, so callers cannot accidentally build a malformed path.
 */
export function buildPath(path: string, params: Readonly<Record<string, string>> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${key}" for path "${path}"`);
    }
    return encodeURIComponent(value);
  });
}
