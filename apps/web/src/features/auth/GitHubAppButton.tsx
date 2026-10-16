import { useId, useState } from "react";
import { useGitHubAppSignIn } from "../../application/auth-provider.tsx";
import { useT } from "../../application/i18n.tsx";

/**
 * "Sign in with GitHub App" (FR-2.5, AC-2.3). Always shown; disabled, with the reason as
 * its description, until the deployment sets both GitHub App variables.
 */
export function GitHubAppButton({ rememberMe }: { readonly rememberMe: boolean }) {
  const t = useT();
  const githubApp = useGitHubAppSignIn();
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  function start() {
    if (githubApp === null) return;
    setPending(true);
    setFailed(false);
    // On success the page navigates to GitHub, so only failure needs handling.
    githubApp.start({ rememberMe }).catch(() => {
      setPending(false);
      setFailed(true);
    });
  }

  return (
    <p>
      <button
        type="button"
        onClick={start}
        disabled={githubApp === null || pending}
        aria-describedby={githubApp === null ? hintId : undefined}
      >
        {t("ga_button")}
      </button>
      {githubApp === null && <span id={hintId}> {t("ga_disabled")}</span>}
      {failed && <span role="alert"> {t("si_errUnexpected")}</span>}
    </p>
  );
}
