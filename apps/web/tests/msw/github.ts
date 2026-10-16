import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

export const USER_URL = "https://api.github.com/user";
export const GRAPHQL_URL = "https://api.github.com/graphql";
const API_URL = "https://api.github.com";

/** A recorded response under tests/fixtures/github/. */
interface Fixture {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

function replay(fixture: Fixture): Response {
  // The fixture's own headers carry the content type.
  // A 304 has no body, and Response refuses one.
  return new HttpResponse(fixture.body === null ? null : JSON.stringify(fixture.body), {
    status: fixture.status,
    headers: fixture.headers,
  });
}

interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
  readonly ifNoneMatch: string | null;
}

type Responder = Fixture | ((request: Request) => Response | Promise<Response>);
const toResolver =
  (f: Responder) =>
  ({ request }: { request: Request }) =>
    typeof f === "function" ? f(request) : replay(f);

/** A resolver answering with each responder in turn; the last one repeats. */
function inTurn(responders: readonly [Responder, ...Responder[]]) {
  let next = 0;
  return (info: { request: Request }) => {
    const responder = responders[Math.min(next, responders.length - 1)] ?? responders[0];
    next += 1;
    return toResolver(responder)(info);
  };
}

/** `rateLimit.cost` of a served GraphQL body, or 0. */
async function costOf(response: Response): Promise<number> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("data" in body)) return 0;
  const { data } = body;
  if (typeof data !== "object" || data === null || !("rateLimit" in data)) return 0;
  const { rateLimit } = data;
  if (typeof rateLimit !== "object" || rateLimit === null || !("cost" in rateLimit)) return 0;
  return typeof rateLimit.cost === "number" ? rateLimit.cost : 0;
}

/**
 * An MSW server for one test file, failing on any request no handler answers, and
 * recording every request so tests can assert the exact count (AC-2.1) and the quota
 * budget (ADR-0017): `budget()` sums the GraphQL `rateLimit.cost` of every response served.
 */
export function setupGitHubServer() {
  const server = setupServer();
  const requests: RecordedRequest[] = [];
  let costs: Promise<number>[] = [];

  server.events.on("request:start", ({ request }) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get("Authorization"),
      ifNoneMatch: request.headers.get("If-None-Match"),
    });
  });
  server.events.on("response:mocked", ({ request, response }) => {
    if (request.url === GRAPHQL_URL) costs.push(costOf(response.clone()));
  });

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
    costs = [];
  });
  afterAll(() => server.close());

  return {
    requests,
    /** Answers `GET /user` and `POST /graphql` with the given fixtures. */
    respond(user: Responder, probe?: Responder) {
      server.use(http.get(USER_URL, toResolver(user)));
      if (probe !== undefined) server.use(http.post(GRAPHQL_URL, toResolver(probe)));
    },
    /** Answers `POST /graphql` with each responder in turn; the last one repeats. */
    graphql(...responders: [Responder, ...Responder[]]) {
      server.use(http.post(GRAPHQL_URL, inTurn(responders)));
    },
    /** Answers `GET <path>` (relative to api.github.com) with each responder in turn. */
    rest(path: string, ...responders: [Responder, ...Responder[]]) {
      server.use(http.get(`${API_URL}${path}`, inTurn(responders)));
    },
    /** Answers `POST <url>` on any origin (the GitHub App exchange handler) in turn. */
    post(url: string, ...responders: [Responder, ...Responder[]]) {
      server.use(http.post(url, inTurn(responders)));
    },
    /** Requests made and GraphQL points spent so far in this test. */
    async budget(): Promise<{ readonly requests: number; readonly graphqlCost: number }> {
      const all = await Promise.all(costs);
      return { requests: requests.length, graphqlCost: all.reduce((sum, c) => sum + c, 0) };
    },
  };
}
