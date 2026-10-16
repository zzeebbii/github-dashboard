import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useGitHubAppSignIn } from "../../application/auth-provider.tsx";
import { AuthError, type AuthErrorKind } from "../../application/auth.ts";
import { useT } from "../../application/i18n.tsx";
import type { MessageKey } from "../../i18n/en.ts";

const errorKeys = {
  "invalid-format": "ga_errRejected",
  "invalid-token": "ga_errRejected",
  "sso-required": "si_errSso",
  "rate-limited": "si_errRateLimited",
  network: "si_errNetwork",
  "unexpected-response": "si_errUnexpected",
  "invalid-callback": "ga_errInvalidCallback",
} as const satisfies Record<AuthErrorKind, MessageKey>;

/**
 * `/auth/callback`, where GitHub sends the browser back (FR-2.5, FR-2.11). The query string
 * is removed from the address bar first, then the code is exchanged; on success the user
 * lands on Home.
 */
export function GitHubAppCallback() {
  const t = useT();
  const router = useRouter();
  const navigate = useNavigate();
  const githubApp = useGitHubAppSignIn();
  const started = useRef(false);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    // StrictMode runs effects twice; the code and state are single use.
    if (started.current) return;
    started.current = true;
    // Before any other work: `code` and `state` must not stay in the address bar or history.
    const { pathname, searchStr } = router.state.location;
    router.history.replace(pathname);
    if (githubApp === null) return;
    githubApp.complete(searchStr).then(
      () => navigate({ to: "/", replace: true }),
      (caught: unknown) => {
        setError(caught instanceof AuthError ? errorKeys[caught.kind] : "si_errUnexpected");
      },
    );
  }, [githubApp, navigate, router]);

  const shown = githubApp === null ? "ga_disabled" : error;

  return (
    <main>
      <h1>{t("ga_heading")}</h1>
      {shown === null ? (
        <p role="status">{t("ga_working")}</p>
      ) : (
        <>
          <p role="alert">{t(shown)}</p>
          <Link to="/sign-in">{t("ga_backToSignIn")}</Link>
        </>
      )}
    </main>
  );
}
