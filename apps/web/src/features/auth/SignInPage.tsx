import { type FormEvent, useId, useState } from "react";
import { useAccounts, useAuth } from "../../application/auth-provider.tsx";
import { AuthError, type AuthErrorKind, type SignInResult } from "../../application/auth.ts";
import { useAnnounce } from "../../application/announcer.tsx";
import { useT } from "../../application/i18n.tsx";
import { tokenWarnings } from "../../domain/account.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { TokenWarnings } from "../../ui/auth/TokenWarnings.tsx";

const errorKeys = {
  "invalid-format": "si_errInvalidFormat",
  "invalid-token": "si_errInvalidToken",
  "sso-required": "si_errSso",
  "rate-limited": "si_errRateLimited",
  network: "si_errNetwork",
  "unexpected-response": "si_errUnexpected",
} as const satisfies Record<AuthErrorKind, MessageKey>;

interface SignInPageProps {
  /** Called once signed in, straight away when there is nothing to warn about. */
  readonly onContinue: () => void;
}

/**
 * PAT sign-in (FR-2.2). The input is uncontrolled and the token is never put in React
 * state, so it does not show up in DevTools and is gone once the request is made.
 */
export function SignInPage({ onContinue }: SignInPageProps) {
  const t = useT();
  const announce = useAnnounce();
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
      else {
        announce(t("si_signedInAs", { login: signedIn.account.login }));
        setResult(signedIn);
      }
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
      <h1>{t("si_heading")}</h1>
      {account === null || result === null ? (
        <form onSubmit={onSubmit} aria-busy={pending}>
          <p>{t("si_intro")}</p>
          <label htmlFor={tokenId}>{t("si_tokenLabel")}</label>
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
            {pending ? t("si_submitting") : t("si_submit")}
          </button>
          {error !== null && (
            <p id={`${tokenId}-error`} role="alert">
              {t(errorKeys[error])}
            </p>
          )}
        </form>
      ) : (
        <>
          <p>{t("si_signedInAs", { login: account.login })}</p>
          <TokenWarnings
            t={t}
            warnings={tokenWarnings(account)}
            tokenType={account.tokenType}
            missingPermissions={result.missingPermissions}
            ssoAuthorizationNeeded={result.ssoAuthorizationNeeded}
          />
          <button type="button" onClick={onContinue}>
            {t("si_continue")}
          </button>
        </>
      )}
    </main>
  );
}
