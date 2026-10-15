import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const USER_URL = "https://api.github.com/user";
export const GRAPHQL_URL = "https://api.github.com/graphql";

/** A recorded response under tests/fixtures/github/. */
export interface Fixture {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

function replay(fixture: Fixture): Response {
  // The fixture's own headers carry the content type.
  return new HttpResponse(JSON.stringify(fixture.body), {
    status: fixture.status,
    headers: fixture.headers,
  });
}

interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
}

/**
 * An MSW server for one test file, failing on any request no handler answers, and
 * recording every request so tests can assert the exact count (AC-2.1).
 */
export function setupGitHubServer() {
  const server = setupServer();
  const requests: RecordedRequest[] = [];

  server.events.on("request:start", ({ request }) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get("Authorization"),
    });
  });

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
  });
  afterAll(() => server.close());

  return {
    requests,
    /** Answers `GET /user` and `POST /graphql` with the given fixtures. */
    respond(user: Fixture | (() => Response), probe?: Fixture | (() => Response)) {
      const toResolver = (f: Fixture | (() => Response)) => () =>
        typeof f === "function" ? f() : replay(f);
      server.use(http.get(USER_URL, toResolver(user)));
      if (probe !== undefined) server.use(http.post(GRAPHQL_URL, toResolver(probe)));
    },
  };
}
