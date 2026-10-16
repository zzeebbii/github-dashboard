import { useEffect } from "react";
import { useAnnounce } from "../../application/announcer.tsx";
import { useAccounts } from "../../application/auth-provider.tsx";
import { useI18n } from "../../application/i18n.tsx";
import { RATE_LIMIT_POOLS, type RateLimitPool } from "../../application/rate-limits.ts";
import { useRefreshScheduler, useRefreshState } from "../../application/refresh-provider.tsx";
import { quotaLevel } from "../../domain/quota.ts";
import { OfflineBanner } from "../../ui/shell/OfflineBanner.tsx";
import { QuotaPopover, type QuotaRow } from "../../ui/shell/QuotaPopover.tsx";
import { UpdatedIndicator } from "../../ui/shell/UpdatedIndicator.tsx";

/**
 * Wires the refresh scheduler into the header's quota and "updated" slots and the offline
 * banner (FR-3.7, FR-3.11, FR-3.12). Every label is computed from the scheduler's clock.
 */

const MINUTE = 60_000;

/** "Updated 3 min ago" and the refresh button. Also keeps the scheduler on the active account. */
export function UpdatedContainer() {
  const { t, format } = useI18n();
  const announce = useAnnounce();
  const scheduler = useRefreshScheduler();
  const { refreshing, lastRefreshAt, now } = useRefreshState();
  const accountId = useAccounts().activeAccount?.id ?? null;

  useEffect(() => {
    scheduler.setAccount(accountId);
  }, [scheduler, accountId]);

  // Polite, and only when there is news: a manual refresh, or data that changed.
  useEffect(
    () =>
      scheduler.onRefreshed(({ manual, changed }) => {
        if (manual || changed) announce(t("fr_refreshed"));
      }),
    [scheduler, announce, t],
  );

  const label = refreshing
    ? t("fr_updating")
    : lastRefreshAt === null
      ? null
      : now.getTime() - lastRefreshAt.getTime() < MINUTE
        ? t("fr_updatedNow")
        : t("fr_updated", { ago: format.relative(lastRefreshAt, now) });

  return (
    <UpdatedIndicator
      t={t}
      label={label}
      refreshing={refreshing}
      onRefresh={() => void scheduler.refreshNow()}
    />
  );
}

/** The quota button and popover for the active account. */
export function QuotaContainer() {
  const { t, format } = useI18n();
  const { quota, now } = useRefreshState();
  const { activeAccount } = useAccounts();
  if (activeAccount === null) return null;

  const row = (pool: RateLimitPool): QuotaRow | [] => {
    const state = quota[pool];
    if (state === undefined || state.resetAt <= now) return [];
    const untilReset = state.resetAt.getTime() - now.getTime();
    const resets =
      untilReset < MINUTE
        ? t("fr_resetsSoon")
        : t("fr_resetsIn", { m: Math.ceil(untilReset / MINUTE) });
    return {
      key: pool,
      name: t(`fr_pool_${pool}`),
      remaining: format.number(state.remaining),
      limit: format.number(state.limit),
      percent: state.limit > 0 ? (state.remaining / state.limit) * 100 : 0,
      level: quotaLevel(state),
      window: pool === "search" ? t("fr_perMin") : t("fr_perHour"),
      reset: `${resets} · ${format.date(state.resetAt, { timeStyle: "short" })}`,
    };
  };
  const rows = RATE_LIMIT_POOLS.flatMap(row);
  // As in the design: the button shows whichever of GraphQL and REST is lower.
  const summary =
    rows
      .filter((r) => r.key !== "search")
      .toSorted((a, b) => a.percent - b.percent)
      .at(0) ?? null;

  return <QuotaPopover t={t} login={activeAccount.login} rows={rows} summary={summary} />;
}

/** The offline banner with the last refresh time (AC-3.9); announced once on going offline. */
export function OfflineBannerContainer() {
  const { t, format } = useI18n();
  const announce = useAnnounce();
  const { online, lastRefreshAt } = useRefreshState();
  const message =
    lastRefreshAt === null
      ? t("fr_offlineNoData")
      : t("fr_offline", {
          time: format.date(lastRefreshAt, { dateStyle: "medium", timeStyle: "short" }),
        });

  // The text cannot change while offline (nothing refreshes), so this fires on going offline.
  useEffect(() => {
    if (!online) announce(message);
  }, [online, message, announce]);

  return online ? null : <OfflineBanner message={message} />;
}
