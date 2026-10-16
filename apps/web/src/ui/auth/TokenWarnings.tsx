import { useId } from "react";
import type { PermissionArea } from "../../application/auth.ts";
import type { Translate } from "../../application/i18n.tsx";
import type { TokenType, TokenWarning } from "../../domain/account.ts";
import type { MessageKey } from "../../i18n/en.ts";

const areaKeys = {
  "pull-requests": "tw_areaPullRequests",
  checks: "tw_areaChecks",
  "org-membership": "tw_areaOrgMembership",
} as const satisfies Record<PermissionArea, MessageKey>;

const fineGrainedGrants = {
  "pull-requests": "tw_fgPullRequests",
  checks: "tw_fgChecks",
  "org-membership": "tw_fgOrgMembership",
} as const satisfies Record<PermissionArea, MessageKey>;

const grantKeys = {
  classic: {
    "pull-requests": "tw_classicRepo",
    checks: "tw_classicRepo",
    "org-membership": "tw_classicReadOrg",
  },
  "fine-grained": fineGrainedGrants,
  // A GitHub App asks for the same named permissions as a fine-grained token.
  "github-app": fineGrainedGrants,
} as const satisfies Record<TokenType, Record<PermissionArea, MessageKey>>;

interface TokenWarningsProps {
  readonly t: Translate;
  readonly warnings: readonly TokenWarning[];
  readonly tokenType: TokenType;
  /** null: the probe could not run. */
  readonly missingPermissions: readonly PermissionArea[] | null;
  readonly ssoAuthorizationNeeded: boolean;
}

/** Write-scope and permission warnings. Text only; nothing here holds a token. */
export function TokenWarnings({
  t,
  warnings,
  tokenType,
  missingPermissions,
  ssoAuthorizationNeeded,
}: TokenWarningsProps) {
  const headingId = useId();
  const messages: string[] = warnings.map(() => t("tw_writeAccess"));
  if (missingPermissions === null) messages.push(t("tw_probeFailed"));
  if (ssoAuthorizationNeeded) messages.push(t("tw_sso"));
  const missing = missingPermissions ?? [];

  if (messages.length === 0 && missing.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{t("tw_heading")}</h2>
      {messages.length > 0 && (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <>
          <h3>{t("tw_missingHeading")}</h3>
          <ul>
            {missing.map((area) => (
              <li key={area}>
                {t(areaKeys[area])}: {t(grantKeys[tokenType][area])}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
