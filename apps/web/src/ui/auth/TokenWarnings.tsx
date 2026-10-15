import { useId } from "react";
import type { PermissionArea } from "../../application/auth.ts";
import type { TokenType, TokenWarning } from "../../domain/account.ts";

// Every user-visible string in this component, in one place for the i18n follow-up.
const STRINGS = {
  heading: "About this token",
  writeAccess:
    "This token can write to your repositories (classic “repo” scope). The dashboard only reads, so a fine-grained token with read-only access is safer.",
  expiresSoon: (days: number, date: string) =>
    `This token expires in ${days} ${days === 1 ? "day" : "days"} (${date}). Create a new one before then.`,
  missingHeading: "Missing read permissions",
  probeFailed: "The token's permissions could not be checked. Some sections may stay empty.",
  sso: "An organisation uses SAML single sign-on. Authorise this token for it on GitHub under Settings → Developer settings → Personal access tokens → Configure SSO.",
  area: {
    "pull-requests": "Pull requests",
    checks: "Checks and statuses",
    "org-membership": "Organisation membership",
  },
  grantAt: {
    classic: {
      "pull-requests": "add the “repo” scope (private repositories)",
      checks: "add the “repo” scope (private repositories)",
      "org-membership": "add the “read:org” scope",
    },
    "fine-grained": {
      "pull-requests": "Repository permissions → Pull requests: Read-only",
      checks: "Repository permissions → Commit statuses: Read-only",
      "org-membership": "Organization permissions → Members: Read-only",
    },
  },
} as const;

interface TokenWarningsProps {
  readonly warnings: readonly TokenWarning[];
  readonly tokenType: TokenType;
  /** null: the probe could not run. */
  readonly missingPermissions: readonly PermissionArea[] | null;
  readonly ssoAuthorizationNeeded: boolean;
}

/** Write-scope, expiry and permission warnings. Text only; nothing here holds a token. */
export function TokenWarnings({
  warnings,
  tokenType,
  missingPermissions,
  ssoAuthorizationNeeded,
}: TokenWarningsProps) {
  const headingId = useId();
  const messages = warnings.map((warning) =>
    warning.kind === "write-access"
      ? STRINGS.writeAccess
      : STRINGS.expiresSoon(warning.daysLeft, warning.expiresAt.slice(0, 10)),
  );
  if (missingPermissions === null) messages.push(STRINGS.probeFailed);
  if (ssoAuthorizationNeeded) messages.push(STRINGS.sso);
  const missing = missingPermissions ?? [];

  if (messages.length === 0 && missing.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{STRINGS.heading}</h2>
      {messages.length > 0 && (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <>
          <h3>{STRINGS.missingHeading}</h3>
          <ul>
            {missing.map((area) => (
              <li key={area}>
                {STRINGS.area[area]}: {STRINGS.grantAt[tokenType][area]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
