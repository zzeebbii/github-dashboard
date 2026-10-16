import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounts } from "../../application/auth-provider.tsx";
import { type HomeRow, useHome } from "../../application/home/use-home.ts";
import { useI18n, useT } from "../../application/i18n.tsx";
import { applyPrFilters, usePrFilters } from "../../application/pr-filters.ts";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { useRefreshState } from "../../application/refresh-provider.tsx";
import type { Account } from "../../domain/account.ts";
import type { Section as SectionId } from "../../domain/sections.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { Section, TruncationNotice } from "../../ui/home/Section.tsx";
import { FilterBar } from "../../ui/pr/FilterBar.tsx";
import { PrList } from "../../ui/pr/PrList.tsx";
import type { PrRowData } from "../../ui/pr/PrRow.tsx";

/** The design's `SECTIONS`, minus "Watching". */
const SECTIONS: readonly { id: SectionId; title: MessageKey; hint: MessageKey }[] = [
  { id: "needs-review", title: "s_review", hint: "s_review_h" },
  { id: "needs-action", title: "s_action", hint: "s_action_h" },
  { id: "waiting", title: "s_waiting", hint: "s_waiting_h" },
];

/** Home inside the shell. The app route requires an account; without one, just the title. */
export function HomePage() {
  const { activeAccount } = useAccounts();
  const t = useT();
  if (activeAccount === null) {
    return (
      <header className="home-header">
        <h1>{t("pullRequests")}</h1>
      </header>
    );
  }
  return <Home account={activeAccount} />;
}

/**
 * Home (FR-5.5): your review requests and your own PRs in three collapsible sections, each
 * with its count, hint and empty text, under the URL-backed filter bar (FR-5.7). A row opens
 * the PR panel in the app; opening it or "Open in GitHub" sets its seen marker (FR-5.8).
 */
function Home({ account }: { account: Account }) {
  const { t, format } = useI18n();
  const { density } = usePreferences().preferences;
  const { now } = useRefreshState();
  const { filters, update, reset } = usePrFilters();
  const navigate = useNavigate();
  const home = useHome(account);
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionId>>(new Set());

  const all = SECTIONS.flatMap(({ id }) => home.sections[id]);
  const attention = [...home.sections["needs-review"], ...home.sections["needs-action"]];
  const labelCounts = new Map<string, number>();
  for (const label of all.flatMap((row) => row.pr.labels)) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  function toRowData({ pr, reason, newCount }: HomeRow): PrRowData {
    const [owner = "", name = ""] = pr.repository.split("/");
    const params = { owner, name, number: String(pr.number) };
    return {
      pr,
      reason,
      newCount,
      href: `/repo/${owner}/${name}/pull/${pr.number}`,
      onOpen: () => {
        void home.markSeen(pr.id);
        void navigate({ to: "/repo/$owner/$name/pull/$number", params });
      },
      onOpenGitHub: () => void home.markSeen(pr.id),
    };
  }

  function visible(rows: readonly HomeRow[]): HomeRow[] {
    const byId = new Map(rows.map((row) => [row.pr.id, row]));
    return applyPrFilters(
      rows.map((row) => row.pr),
      filters,
      { viewerLogin: account.login, now },
    ).flatMap((pr) => byId.get(pr.id) ?? []);
  }

  return (
    <>
      <header className="home-header">
        <h1>{t("pullRequests")}</h1>
        {!home.isPending && (
          <p className="home-subtitle">
            {t("homeSub", {
              n: attention.length,
              r: new Set(attention.map((row) => row.pr.repository)).size,
            })}
          </p>
        )}
      </header>
      <FilterBar
        t={t}
        filters={filters}
        labels={[...labelCounts].map(([name, count]) => ({ name, count }))}
        onChange={update}
        onReset={reset}
      />
      {home.truncated && <TruncationNotice text={t("hm_truncated")} />}
      {home.error !== null && all.length === 0 ? (
        <p className="home-notice" role="alert">
          {t("hm_error")}
        </p>
      ) : home.isPending ? (
        <p className="home-notice" role="status">
          {t("hm_loading")}
        </p>
      ) : (
        <div className="home-sections">
          {SECTIONS.map(({ id, title, hint }) => {
            const rows = visible(home.sections[id]);
            return (
              <Section
                key={id}
                title={t(title)}
                hint={t(hint)}
                count={rows.length}
                expanded={!collapsed.has(id)}
                onToggle={() => {
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (!next.delete(id)) next.add(id);
                    return next;
                  });
                }}
                emptyText={t("emptySection")}
              >
                <PrList
                  t={t}
                  format={format}
                  now={now}
                  density={density}
                  showRepository
                  label={t(title)}
                  rows={rows.map(toRowData)}
                />
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}
