import { API_INFO, allEndpoints, type AnyEndpoint } from "@kit/contracts";
import { z } from "zod";

/**
 * Generates the OpenAPI 3.1 document from the contract.
 *
 * The output is committed as artifacts/openapi.json and is THE language-neutral
 * source of truth: a .NET, Go, or Java replacement for this backend implements
 * that document and never touches the TypeScript contract package.
 *
 * Generation is deterministic — keys are emitted in sorted order — so the drift
 * check compares content, not incidental ordering.
 */

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

/** Converts the contract's `:param` syntax into OpenAPI's `{param}` syntax. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * The subset of a JSON Schema object this generator reads. Declaring it means
 * `toParameterSchema` returns something usable directly, with no type assertion.
 */
interface JsonSchemaObject {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

function toJsonSchema(schema: z.ZodType): unknown {
  // Zod 4 exports JSON Schema natively. `io: 'output'` emits the post-transform
  // shape, which is what a client actually receives.
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "output", unrepresentable: "any" });
}

function toParameterSchema(schema: z.ZodType): JsonSchemaObject {
  // Query and path params are strings on the wire, so describe the INPUT shape.
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" });
}

function buildParameters(endpoint: AnyEndpoint): unknown[] {
  const parameters: unknown[] = [];

  const collect = (schema: z.ZodType | undefined, location: "path" | "query") => {
    if (schema === undefined) return;
    const jsonSchema = toParameterSchema(schema);
    const properties = jsonSchema.properties ?? {};
    const required = new Set(jsonSchema.required ?? []);

    for (const name of Object.keys(properties).toSorted()) {
      parameters.push({
        name,
        in: location,
        required: location === "path" ? true : required.has(name),
        schema: properties[name],
      });
    }
  };

  collect(endpoint.params, "path");
  collect(endpoint.query, "query");
  return parameters;
}

function buildResponses(endpoint: AnyEndpoint): Record<string, unknown> {
  const responses: Record<string, unknown> = {};

  for (const status of Object.keys(endpoint.responses).toSorted()) {
    const schema = endpoint.responses[Number(status)];
    if (schema === undefined) continue;

    // 204 carries no body by definition.
    if (status === "204") {
      responses[status] = { description: "No content" };
      continue;
    }

    const isProblem = Number(status) >= 400;
    responses[status] = {
      description: isProblem ? "Problem details (RFC 9457)" : endpoint.summary,
      content: {
        [isProblem ? "application/problem+json" : "application/json"]: {
          schema: toJsonSchema(schema),
        },
      },
    };
  }

  return responses;
}

export function generateOpenApiDocument(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  // Sort by operationId so output ordering is stable across runs.
  const endpoints = allEndpoints.toSorted((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );

  for (const endpoint of endpoints) {
    const path = toOpenApiPath(endpoint.path);
    const operation: Record<string, unknown> = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      tags: [...endpoint.tags],
      responses: buildResponses(endpoint),
    };

    const parameters = buildParameters(endpoint);
    if (parameters.length > 0) {
      operation["parameters"] = parameters;
    }

    if (endpoint.body !== undefined) {
      operation["requestBody"] = {
        required: true,
        content: { "application/json": { schema: toJsonSchema(endpoint.body) } },
      };
    }

    paths[path] = { ...paths[path], [endpoint.method]: operation };
  }

  return {
    openapi: "3.1.0",
    info: { title: API_INFO.title, version: API_INFO.version, description: API_INFO.description },
    paths: Object.fromEntries(Object.entries(paths).toSorted(([a], [b]) => a.localeCompare(b))),
    components: { schemas: {} },
  };
}

/** Stable serialisation used by both the generator and the CI drift check. */
export function serialiseOpenApiDocument(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
