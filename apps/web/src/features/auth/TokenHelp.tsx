import { Check, ExternalLink } from "lucide-react";
import { useId } from "react";
import { useT } from "../../application/i18n.tsx";
import type { MessageKey } from "../../i18n/en.ts";
import { Icon } from "../../ui/Icon.tsx";

const TOKEN_NAME = "GitHub Dashboard";
const TOKEN_DESCRIPTION = "Read-only access for GitHub Dashboard";

/**
 * GitHub's new fine-grained token page, pre-filled with what the dashboard reads. Parameters:
 * https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
 * (`members` only applies when an organisation is the resource owner; Metadata is automatic).
 */
const FINE_GRAINED_URL = `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams(
  {
    name: TOKEN_NAME,
    description: TOKEN_DESCRIPTION,
    expires_in: "90",
    pull_requests: "read",
    statuses: "read",
    contents: "read",
    members: "read",
  },
).toString()}`;

/** The classic form reads `scopes` and `description` too; GitHub's docs do not list them. */
const CLASSIC_URL = `https://github.com/settings/tokens/new?${new URLSearchParams({
  scopes: "repo,read:org",
  description: TOKEN_DESCRIPTION,
}).toString()}`;

const permissions = [
  "tw_fgPullRequests",
  "tw_fgChecks",
  "si_fgContents",
  "si_fgMetadata",
  "tw_fgOrgMembership",
] as const satisfies readonly MessageKey[];

/** "Need a token?": links to GitHub's token pages with the permissions already chosen. */
export function TokenHelp() {
  const t = useT();
  const headingId = useId();
  const classicId = useId();
  const newTab = <span className="sr-only"> {t("si_opensInNewTab")}</span>;

  return (
    <section className="signin-help" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("si_needToken")}</h2>
      <a className="signin-create" href={FINE_GRAINED_URL} target="_blank" rel="noreferrer">
        <span>{t("si_createFineGrained")}</span>
        <span className="signin-badge">{t("si_recommended")}</span>
        <Icon icon={ExternalLink} size={14} />
        {newTab}
      </a>
      <details className="signin-permissions">
        <summary>{t("si_prefilled")}</summary>
        <ul>
          {permissions.map((key) => (
            <li key={key}>
              <Icon icon={Check} size={14} />
              {t(key)}
            </li>
          ))}
        </ul>
        <p>{t("si_orgOwnerNote")}</p>
      </details>
      <p className="signin-classic">
        <a href={CLASSIC_URL} target="_blank" rel="noreferrer" aria-describedby={classicId}>
          {t("si_createClassic")}
          {newTab}
        </a>
        <span id={classicId}> {t("si_classicWarning")}</span>
      </p>
    </section>
  );
}
