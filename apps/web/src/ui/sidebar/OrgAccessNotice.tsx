import { ExternalLink, TriangleAlert } from "lucide-react";
import { useId } from "react";
import type { OrgAccessIssue } from "../../application/github.ts";
import type { Translate } from "../../application/i18n.tsx";
import { Icon } from "../Icon.tsx";

const REASON = {
  sso: "sb_reason_sso",
  fineGrainedPolicy: "sb_reason_fineGrainedPolicy",
  appNotInstalled: "sb_reason_appNotInstalled",
} as const;

/**
 * Organisations GitHub would not show this token (FR-3.10), each with the reason and a
 * "Fix access" link to GitHub. The rest of the list still renders below it.
 */
export function OrgAccessNotice({
  t,
  issues,
}: {
  readonly t: Translate;
  readonly issues: readonly OrgAccessIssue[];
}) {
  const headingId = useId();
  if (issues.length === 0) return null;
  return (
    <section className="org-access" aria-labelledby={headingId}>
      <h2 id={headingId} className="org-access-title">
        <Icon icon={TriangleAlert} size={14} />
        {t("sb_orgAccess")}
      </h2>
      <ul>
        {issues.map((issue) => {
          const org = issue.org ?? t("sb_unknownOrg");
          return (
            <li key={`${org}:${issue.reason}`}>
              <strong>{org}</strong>
              <span>{t(REASON[issue.reason])}</span>
              <a
                href={issue.fixUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("sb_fixAccessFor", { org })}
              >
                {t("sb_fixAccess")}
                <Icon icon={ExternalLink} size={12} />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
