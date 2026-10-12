import { describe, expect, it } from "vitest";
import { ApiError } from "../application/ports.ts";
import { createHttpTaskApi } from "./http-task-api.ts";

/**
 * Tests for the HTTP adapter — the one place the wire format matters.
 *
 * `fetch` is injected rather than globally patched, so these tests are hermetic
 * and parallel-safe. This is also where contract-drift protection is verified:
 * a server response that violates the contract must be REJECTED, not passed
 * through to the application.
 */

/** Extracts the URL without relying on default object stringification. */
function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function stubFetch(responder: (url: string, init: RequestInit) => Response): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(toUrl(input), init ?? {}));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const validTask = {
  id: "2f1c8b6e-0f5a-4d3b-9c1a-7e5d2b8a4f10",
  title: "Write the ADR",
  done: false,
  createdAt: "2026-08-15T10:00:00.000Z",
};

describe("createHttpTaskApi", () => {
  it("requests the contract path and parses a valid list", async () => {
    let requestedUrl = "";
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      fetchImpl: stubFetch((url) => {
        requestedUrl = url;
        return json({ items: [validTask], total: 1 });
      }),
    });

    const result = await api.list({});

    expect(requestedUrl).toBe("http://api.test/api/tasks");
    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe("Write the ADR");
  });

  it("serialises query parameters", async () => {
    let requestedUrl = "";
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      fetchImpl: stubFetch((url) => {
        requestedUrl = url;
        return json({ items: [], total: 0 });
      }),
    });

    await api.list({ done: true, limit: 5, offset: 10 });

    expect(requestedUrl).toBe("http://api.test/api/tasks?done=true&limit=5&offset=10");
  });

  it("strips a trailing slash from the base URL", async () => {
    let requestedUrl = "";
    const api = createHttpTaskApi({
      baseUrl: "http://api.test/",
      fetchImpl: stubFetch((url) => {
        requestedUrl = url;
        return json({ items: [], total: 0 });
      }),
    });

    await api.list({});

    expect(requestedUrl).toBe("http://api.test/api/tasks");
  });

  it("substitutes path parameters when updating", async () => {
    let requestedUrl = "";
    let method = "";
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      fetchImpl: stubFetch((url, init) => {
        requestedUrl = url;
        method = String(init.method);
        return json({ ...validTask, done: true });
      }),
    });

    await api.update(validTask.id, { done: true });

    expect(requestedUrl).toBe(`http://api.test/api/tasks/${validTask.id}`);
    expect(method).toBe("PATCH");
  });

  it("REJECTS a response that violates the contract instead of passing it through", async () => {
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      // `total` is missing and `done` is the wrong type — a real drift scenario.
      fetchImpl: stubFetch(() => json({ items: [{ ...validTask, done: "yes" }] })),
    });

    await expect(api.list({})).rejects.toThrow(/does not match the API contract/);
  });

  it("converts an RFC 9457 problem into an ApiError with field errors", async () => {
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      fetchImpl: stubFetch(() =>
        json(
          {
            type: "https://kit.example/problems/validation-failed",
            title: "Validation failed",
            status: 400,
            detail: "The request body did not satisfy the API contract.",
            errors: [{ pointer: "/title", message: "Title must not be empty." }],
          },
          400,
        ),
      ),
    });

    await expect(api.create({ title: "" })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      fieldErrors: [{ pointer: "/title", message: "Title must not be empty." }],
    });
  });

  it("falls back gracefully when an error body is not a problem document", async () => {
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      // e.g. an HTML error page from a proxy.
      fetchImpl: stubFetch(() => new Response("<html>502</html>", { status: 502 })),
    });

    const error = await api.list({}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("resolves without a body on 204 delete", async () => {
    const api = createHttpTaskApi({
      baseUrl: "http://api.test",
      fetchImpl: stubFetch(() => new Response(null, { status: 204 })),
    });

    await expect(api.remove(validTask.id)).resolves.toBeUndefined();
  });
});
