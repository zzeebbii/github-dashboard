import { type FormEvent, useId, useState } from "react";
import { useAccounts, useAuth } from "../../application/auth-provider.tsx";
import { AuthError, type AuthErrorKind, type SignInResult } from "../../application/auth.ts";
import { tokenWarnings } from "../../domain/account.ts";
import { TokenWarnings } from "../../ui/auth/TokenWarnings.tsx";

// Every user-visible string on this page, in one place for the i18n follow-up.
const STRINGS = {
  heading: "Sign in to GitHub",
  intro:
    "Paste a GitHub personal access token. It stays in this browser and is sent only to api.github.com.",
  tokenLabel: "Personal access token",
  submit: "Sign in",
  submitting: "Checking token…",
  signedInAs: (login: string) => `Signed in as ${login}.`,
  continue: "Continue to dashboard",
  errors: {
    "invalid-format": "That does not look like a GitHub token. Paste the whole token.",
    "invalid-token": "This token is invalid, revoked or expired. Create a new one on GitHub.",
    "sso-required":
      "An organisation requires SAML single sign-on. Authorise this token for it on GitHub, then try again.",
    "rate-limited": "GitHub's rate limit was reached. Wait a few minutes and try again.",
    network: "Could not reach GitHub. Check your connection and try again.",
    "unexpected-response": "GitHub sent an unexpected answer. Try again later.",
  } satisfies Record<AuthErrorKind, string>,
} as const;

interface SignInPageProps {
  /** Called once signed in, straight away when there is nothing to warn about. */
  readonly onContinue: () => void;
}

/**
 * PAT sign-in (FR-2.2). The input is uncontrolled and the token is never put in React
 * state, so it does not show up in DevTools and is gone once the request is made.
 */
export function SignInPage({ onContinue }: SignInPageProps) {
  const { signIn } = useAuth();
  const { activeAccount } = useAccounts();
  const tokenId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [result, setResult] = useState<SignInResult | null>(null);

  async function submit(form: HTMLFormElement) {
    const token = new FormData(form).get("token");
    form.reset();
    setPending(true);
    setError(null);
    try {
      const signedIn = await signIn({
        token: typeof token === "string" ? token : "",
        rememberMe: false,
      });
      const nothingToSay =
        tokenWarnings(signedIn.account).length === 0 &&
        signedIn.missingPermissions?.length === 0 &&
        !signedIn.ssoAuthorizationNeeded;
      if (nothingToSay) onContinue();
      else setResult(signedIn);
    } catch (caught) {
      setError(caught instanceof AuthError ? caught.kind : "unexpected-response");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(event.currentTarget);
  }

  // Warnings come from the stored account, the source of truth, not the one-off result.
  const account = result === null ? null : (activeAccount ?? result.account);

  return (
    <main>
      <h1>{STRINGS.heading}</h1>
      {account === null || result === null ? (
        <form onSubmit={onSubmit} aria-busy={pending}>
          <p>{STRINGS.intro}</p>
          <label htmlFor={tokenId}>{STRINGS.tokenLabel}</label>
          <input
            id={tokenId}
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            required
            aria-describedby={error === null ? undefined : `${tokenId}-error`}
          />
          <button type="submit" disabled={pending}>
            {pending ? STRINGS.submitting : STRINGS.submit}
          </button>
          {error !== null && (
            <p id={`${tokenId}-error`} role="alert">
              {STRINGS.errors[error]}
            </p>
          )}
        </form>
      ) : (
        <>
          <p role="status">{STRINGS.signedInAs(account.login)}</p>
          <TokenWarnings
            warnings={tokenWarnings(account)}
            tokenType={account.tokenType}
            missingPermissions={result.missingPermissions}
            ssoAuthorizationNeeded={result.ssoAuthorizationNeeded}
          />
          <button type="button" onClick={onContinue}>
            {STRINGS.continue}
          </button>
        </>
      )}
    </main>
  );
}
