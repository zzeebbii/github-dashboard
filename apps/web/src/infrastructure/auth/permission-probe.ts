import { z } from "zod";
import type { PermissionArea } from "../../application/auth.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";

/**
 * One query that touches each kind of data the dashboard reads (FR-2.3):
 * org membership, the viewer's pull requests, and the head commit's check/status
 * rollup. GitHub reports a field the token cannot read as an entry in `errors` whose
 * `path` names that field, so the paths say which permission is missing.
 *
 * ponytail: checks are only exercised when the viewer has at least one PR; a user with
 * none passes the checks probe vacuously. Probe a known repo if that matters.
 */
const PROBE_QUERY = `query PermissionProbe {
  viewer {
    organizations(first: 1) { nodes { login } }
    pullRequests(first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
  }
}`;

const ProbeResponseSchema = z.object({
  errors: z
    .array(
      z.object({
        type: z.string().optional(),
        message: z.string(),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .optional(),
});

/** The first matching field in an error path decides the area. */
const AREA_BY_FIELD: Readonly<Record<string, PermissionArea>> = {
  organizations: "org-membership",
  statusCheckRollup: "checks",
  pullRequests: "pull-requests",
};

export interface ProbeOutcome {
  readonly missing: readonly PermissionArea[];
  readonly ssoAuthorizationNeeded: boolean;
}

function areaOf(path: readonly (string | number)[]): PermissionArea | undefined {
  // Deepest field first: an error at viewer.pullRequests...statusCheckRollup is about checks.
  return path
    .toReversed()
    .map((segment) => AREA_BY_FIELD[String(segment)])
    .find((area) => area !== undefined);
}

/** One POST to /graphql. Returns null when the probe could not run at all. */
export async function probePermissions(
  token: string,
  fetchImpl: typeof fetch,
): Promise<ProbeOutcome | null> {
  let response: Response;
  try {
    response = await fetchImpl(GRAPHQL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: PROBE_QUERY }),
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const parsed = ProbeResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return null;

  const missing = new Set<PermissionArea>();
  let ssoAuthorizationNeeded = false;
  for (const error of parsed.data.errors ?? []) {
    // The GraphQL endpoint does not expose X-GitHub-SSO to browsers (CORS), so SAML
    // enforcement is recognised from GitHub's error message instead.
    if (/SAML/i.test(error.message)) {
      ssoAuthorizationNeeded = true;
      continue;
    }
    // FORBIDDEN: "Resource not accessible by personal access token" (fine-grained).
    // INSUFFICIENT_SCOPES: "Your token has not been granted the required scopes" (classic).
    const isPermissionError =
      error.type === "FORBIDDEN" ||
      error.type === "INSUFFICIENT_SCOPES" ||
      /not accessible|scopes/i.test(error.message);
    if (!isPermissionError) continue;
    const area = error.path === undefined ? undefined : areaOf(error.path);
    if (area === undefined) {
      // A permission error that names no probed field means none of it is readable.
      for (const value of Object.values(AREA_BY_FIELD)) missing.add(value);
    } else {
      missing.add(area);
    }
  }
  return { missing: [...missing], ssoAuthorizationNeeded };
}
