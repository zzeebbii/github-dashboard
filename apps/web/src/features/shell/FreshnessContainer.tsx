import { useEffect } from "react";
import { useAnnounce } from "../../application/announcer.tsx";
import { useAccounts } from "../../application/auth-provider.tsx";
import { useI18n } from "../../application/i18n.tsx";
import { RATE_LIMIT_POOLS, type RateLimitPool } from "../../application/rate-limits.ts";
import { useRefreshScheduler, useRefreshState } from "../../application/refresh-provider.tsx";
import { newSinceRefresh } from "../../domain/activity.ts";
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
  const { activeAccount } = useAccounts();
  const accountId = activeAccount?.id ?? null;
  const login = activeAccount?.login ?? null;

  useEffect(() => {
    scheduler.setAccount(accountId);
  }, [scheduler, accountId]);

  // One polite announcement per refresh, and only with news (FR-7.4): a manual refresh
  // always says how it went; an automatic one only when it brought new PRs or activity, so
  // a CI status flipping every 5 minutes stays quiet.
  useEffect(
    () =>
      scheduler.onRefreshed(({ manual, before, after }) => {
        const fresh = login === null ? 0 : newSinceRefresh(before, after, login);
        if (fresh > 0) announce(t("fr_refreshedNew", { n: fresh }));
        else if (manual) announce(t("fr_refreshed"));
      }),
    [scheduler, announce, t, login],
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
