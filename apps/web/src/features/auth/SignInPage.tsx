import { Eye, EyeOff, GitPullRequest, LoaderCircle, Moon, ShieldCheck, Sun } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useAccounts, useAuth } from "../../application/auth-provider.tsx";
import { AuthError, type AuthErrorKind, type SignInResult } from "../../application/auth.ts";
import { useAnnounce } from "../../application/announcer.tsx";
import { useI18n } from "../../application/i18n.tsx";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { tokenWarnings } from "../../domain/account.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { TokenWarnings } from "../../ui/auth/TokenWarnings.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { LanguageSelect } from "../../ui/LanguageSelect.tsx";
import { GitHubAppButton } from "./GitHubAppButton.tsx";
import { TokenHelp } from "./TokenHelp.tsx";

const errorKeys = {
  "invalid-format": "si_errInvalidFormat",
  "invalid-token": "si_errInvalidToken",
  "sso-required": "si_errSso",
  "rate-limited": "si_errRateLimited",
  network: "si_errNetwork",
  "unexpected-response": "si_errUnexpected",
  "invalid-callback": "ga_errInvalidCallback",
} as const satisfies Record<AuthErrorKind, MessageKey>;

interface SignInPageProps {
  /** Called once signed in, straight away when there is nothing to warn about. */
  readonly onContinue: () => void;
  /** Set when GitHub signed this account out (FR-2.8): the user is asked for a new token. */
  readonly reauthLogin?: string | undefined;
}

/**
 * PAT sign-in (FR-2.2). The input is uncontrolled and the token is never put in React
 * state, so it does not show up in DevTools and is gone once the request is made. "Show"
 * only flips the input's type.
 */
export function SignInPage({ onContinue, reauthLogin }: SignInPageProps) {
  const { t } = useI18n();
  const announce = useAnnounce();
  const { signIn } = useAuth();
  const { activeAccount } = useAccounts();
  const tokenId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [result, setResult] = useState<SignInResult | null>(null);
  const [tokenShown, setTokenShown] = useState(false);
  // Default off (FR-2.7): tokens live in sessionStorage unless the user asks otherwise. State,
  // not FormData, because the GitHub App button sits outside the form and needs it too.
  const [rememberMe, setRememberMe] = useState(false);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const token = data.get("token");
    form.reset();
    setTokenShown(false);
    setPending(true);
    setError(null);
    try {
      const signedIn = await signIn({
        token: typeof token === "string" ? token : "",
        rememberMe,
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
    // aria-disabled rather than disabled keeps the button focusable while a check runs.
    if (pending) return;
    void submit(event.currentTarget);
  }

  // Warnings come from the stored account, the source of truth, not the one-off result.
  const account = result === null ? null : (activeAccount ?? result.account);
  const describedBy = [`${tokenId}-formats`, error === null ? null : `${tokenId}-error`]
    .filter((id) => id !== null)
    .join(" ");

  if (account !== null && result !== null) {
    return (
      <SignInFrame>
        <p className="signin-account">
          <Avatar login={account.login} />
          {t("si_signedInAs", { login: account.login })}
        </p>
        <TokenWarnings
          t={t}
          warnings={tokenWarnings(account)}
          tokenType={account.tokenType}
          missingPermissions={result.missingPermissions}
          ssoAuthorizationNeeded={result.ssoAuthorizationNeeded}
        />
        <button type="button" className="signin-primary" onClick={onContinue}>
          {t("si_continue")}
        </button>
      </SignInFrame>
    );
  }

  return (
    <SignInFrame>
      {reauthLogin !== undefined && (
        <p className="signin-account">
          <Avatar login={reauthLogin} />
          <span>{t("si_reauth", { login: reauthLogin })}</span>
        </p>
      )}
      <form className="signin-form" onSubmit={onSubmit} aria-busy={pending}>
        <p className="signin-privacy">
          <Icon icon={ShieldCheck} size={14} />
          {t("si_intro")}
        </p>
        <label htmlFor={tokenId} className="signin-label">
          {t("si_tokenLabel")}
        </label>
        <div className="signin-token">
          <input
            id={tokenId}
            name="token"
            type={tokenShown ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            required
            aria-invalid={error === null ? undefined : true}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={t("si_showToken")}
            aria-pressed={tokenShown}
            aria-controls={tokenId}
            onClick={() => {
              setTokenShown((shown) => !shown);
            }}
          >
            <Icon icon={tokenShown ? EyeOff : Eye} />
          </button>
        </div>
        <p id={`${tokenId}-formats`} className="hint signin-formats">
          {t("si_tokenFormats")} <code>github_pat_…</code> <code>ghp_…</code>
        </p>
        {error !== null && (
          <p id={`${tokenId}-error`} role="alert" className="signin-error">
            {t(errorKeys[error])}
          </p>
        )}
        <label className="checkbox">
          <input
            name="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => {
              setRememberMe(event.currentTarget.checked);
            }}
            aria-describedby={`${tokenId}-remember`}
          />
          {t("si_rememberMe")}
        </label>
        <p id={`${tokenId}-remember`} className="hint signin-remember-hint">
          {t("si_rememberMeHint")}
        </p>
        <button
          type="submit"
          className="signin-primary"
          aria-disabled={pending}
          aria-busy={pending}
        >
          {pending && (
            <span className="signin-spinner">
              <Icon icon={LoaderCircle} />
            </span>
          )}
          {pending ? t("si_submitting") : t("si_submit")}
        </button>
      </form>
      <div className="signin-divider">
        <span>{t("si_or")}</span>
      </div>
      <GitHubAppButton rememberMe={rememberMe} />
      <TokenHelp />
    </SignInFrame>
  );
}

/** The page around the card: brand, the one h1, then display preferences below. */
function SignInFrame({ children }: { readonly children: ReactNode }) {
  const { t, language, setLanguage } = useI18n();
  const { resolvedTheme, updatePreferences } = usePreferences();
  const dark = resolvedTheme === "dark";
  return (
    <div className="signin">
      <main className="signin-card">
        <div className="signin-brand">
          <span className="signin-mark">
            <Icon icon={GitPullRequest} size={18} />
          </span>
          <span>{t("appTitle")}</span>
        </div>
        <h1>{t("si_heading")}</h1>
        <p className="signin-tagline">{t("si_tagline")}</p>
        {children}
      </main>
      <footer className="signin-footer">
        <LanguageSelect label={t("language")} language={language} onChange={setLanguage} />
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            updatePreferences({ theme: dark ? "light" : "dark" });
          }}
          aria-label={dark ? t("lightTheme") : t("darkTheme")}
        >
          <Icon icon={dark ? Sun : Moon} />
        </button>
      </footer>
    </div>
  );
}

/** Initials, like the account menu: the page then loads nothing from another origin. */
function Avatar({ login }: { readonly login: string }) {
  return (
    <span className="signin-avatar" aria-hidden="true">
      {login.slice(0, 2).toUpperCase()}
    </span>
  );
}
