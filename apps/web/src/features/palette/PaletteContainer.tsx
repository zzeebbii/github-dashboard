import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BookMarked,
  GitPullRequest,
  GitPullRequestDraft,
  House,
  Languages,
  Moon,
  RefreshCw,
  Star,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { useAnnounce } from "../../application/announcer.tsx";
import {
  useAccountActions,
  useAccounts,
  useFavouriteStore,
} from "../../application/auth-provider.tsx";
import { languageNames, languages, useI18n } from "../../application/i18n.tsx";
import { useCachedSearchData } from "../../application/palette.ts";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { useRefreshScheduler } from "../../application/refresh-provider.tsx";
import type { Account } from "../../domain/account.ts";
import { matchesQuery, pullRequestTexts } from "../../domain/palette.ts";
import { CommandPalette, type PaletteOption } from "../../ui/palette/CommandPalette.tsx";

/** Repositories and PRs shown per group; actions are few and always all shown. */
const GROUP_CAP = 20;

const repoParams = (nameWithOwner: string) => {
  const [owner = "", name = ""] = nameWithOwner.split("/");
  return { owner, name };
};

/**
 * The palette's commands (FR-7.1): favourites, cached repositories and PRs, and actions,
 * matched on title, `#number` and `owner/name`. Everything comes from the query cache and
 * the account store: opening and searching make no request (AC-7.1). Mounted while open.
 */
export function PaletteContainer({
  account,
  onClose,
}: {
  /** The active account. */
  account: Account;
  onClose: () => void;
}) {
  const { t, language, setLanguage } = useI18n();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const { resolvedTheme, updatePreferences } = usePreferences();
  const scheduler = useRefreshScheduler();
  const { accounts } = useAccounts();
  const actions = useAccountActions();
  const { favourites } = useFavouriteStore(account.id);
  const { repositories, pullRequests } = useCachedSearchData(account.id);
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";

  const goToRepo = (nameWithOwner: string) => () =>
    void navigate({ to: "/repo/$owner/$name", params: repoParams(nameWithOwner) });

  const favouriteOptions = favourites
    .filter((f) => matchesQuery(query, [f.nameWithOwner]))
    .slice(0, GROUP_CAP)
    .map((f): PaletteOption => ({
      key: `fav-${f.nodeId}`,
      label: f.nameWithOwner,
      icon: Star,
      run: goToRepo(f.nameWithOwner),
    }));

  // Without a query, as in the design: only favourites and actions.
  const isFavourite = new Set(favourites.map((f) => f.nodeId));
  const repoOptions = !searching
    ? []
    : repositories
        .filter((r) => !isFavourite.has(r.id) && matchesQuery(query, [r.nameWithOwner]))
        .slice(0, GROUP_CAP)
        .map((r): PaletteOption => ({
          key: `repo-${r.id}`,
          label: r.nameWithOwner,
          icon: BookMarked,
          run: goToRepo(r.nameWithOwner),
        }));

  const prOptions = !searching
    ? []
    : pullRequests
        .filter((pr) => matchesQuery(query, pullRequestTexts(pr)))
        .slice(0, GROUP_CAP)
        .map((pr): PaletteOption => {
          const { owner, name } = repoParams(pr.repository);
          return {
            key: `pr-${pr.id}`,
            label: pr.title,
            hint: `${name}#${pr.number}`,
            icon: pr.isDraft ? GitPullRequestDraft : GitPullRequest,
            run: () =>
              void navigate({
                to: "/repo/$owner/$name/pull/$number",
                params: { owner, name, number: String(pr.number) },
              }),
          };
        });

  const dark = resolvedTheme === "dark";
  const others = accounts.filter((a) => a.id !== account.id && actions.isSignedIn(a.id));
  const actionOptions: PaletteOption[] = [
    { key: "home", label: t("goHome"), icon: House, run: () => void navigate({ to: "/" }) },
    {
      key: "theme",
      label: dark ? t("lightTheme") : t("darkTheme"),
      icon: dark ? Sun : Moon,
      run: () => {
        updatePreferences({ theme: dark ? "light" : "dark" });
      },
    },
    // The scheduler announces "Dashboard refreshed" itself.
    {
      key: "refresh",
      label: t("fr_refresh"),
      icon: RefreshCw,
      run: () => void scheduler.refreshNow(),
    },
    ...languages
      .filter((l) => l !== language)
      .map((l): PaletteOption => ({
        key: `lang-${l}`,
        label: t("pa_language", { name: languageNames[l] }),
        icon: Languages,
        run: () => {
          setLanguage(l);
        },
      })),
    ...others.map((other): PaletteOption => ({
      key: `account-${other.id}`,
      label: `${t("switchTo")} ${other.login}`,
      icon: ArrowLeftRight,
      run: () =>
        void (async () => {
          await actions.switchActive(other.id);
          announce(t("am_switched", { login: other.login }));
          // As from the account menu: the old page may not exist for this account.
          await navigate({ to: "/" });
        })(),
    })),
  ].filter((option) => matchesQuery(query, [option.label]));

  const groups = [
    { key: "favourites", label: t("favorites"), options: favouriteOptions },
    { key: "repositories", label: t("repositories"), options: repoOptions },
    { key: "pull-requests", label: t("pullRequests"), options: prOptions },
    { key: "actions", label: t("actions"), options: actionOptions },
  ];
  const count = groups.reduce((sum, group) => sum + group.options.length, 0);

  return (
    <CommandPalette
      label={t("pa_title")}
      placeholder={t("cmdPh")}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      resultsLabel={t("pa_results", { n: count })}
      noResultsLabel={t("noResults")}
      onClose={onClose}
    />
  );
}
