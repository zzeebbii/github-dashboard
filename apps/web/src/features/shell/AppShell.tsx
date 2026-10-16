import { Link, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useI18n } from "../../application/i18n.tsx";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { RepositoriesContainer } from "../sidebar/RepositoriesContainer.tsx";
import { AccountMenuContainer } from "./AccountMenuContainer.tsx";
import { OfflineBannerContainer, QuotaContainer, UpdatedContainer } from "./FreshnessContainer.tsx";
import { Drawer } from "../../ui/shell/Drawer.tsx";
import { Header } from "../../ui/shell/Header.tsx";
import { Sidebar } from "../../ui/shell/Sidebar.tsx";
import { SkipLink } from "../../ui/shell/SkipLink.tsx";

const MAIN_ID = "main";

/**
 * The frame every signed-in screen renders in (FR-1.7, FR-1.9): skip link, sidebar (a drawer
 * below 768 px), header and the `main` landmark holding the route's content.
 *
 * The header carries the quota and "updated" slots; the offline banner opens main (T14).
 * The sidebar's repository slot holds the Favourites and Repositories sections (T17).
 */
export function AppShell() {
  const { t, language, setLanguage } = useI18n();
  const { resolvedTheme, updatePreferences } = usePreferences();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebar = (
    <Sidebar
      t={t}
      language={language}
      onLanguageChange={setLanguage}
      repositories={<RepositoriesContainer />}
    />
  );

  return (
    <div className="shell">
      <SkipLink targetId={MAIN_ID} label={t("skipToContent")} />
      {sidebarOpen && <aside className="shell-sidebar">{sidebar}</aside>}
      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
        label={t("mainNav")}
        closeLabel={t("closeMenu")}
      >
        {sidebar}
      </Drawer>
      <div className="shell-column">
        <Header
          t={t}
          crumbs={useCrumbs()}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => {
            setSidebarOpen((open) => !open);
          }}
          onOpenMenu={() => {
            setDrawerOpen(true);
          }}
          quota={<QuotaContainer />}
          updated={<UpdatedContainer />}
          account={<AccountMenuContainer />}
          resolvedTheme={resolvedTheme}
          onToggleTheme={() => {
            updatePreferences({ theme: resolvedTheme === "dark" ? "light" : "dark" });
          }}
        />
        <main id={MAIN_ID} tabIndex={-1} className="main">
          <OfflineBannerContainer />
          <div className="main-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

interface Crumb {
  readonly key: string;
  readonly node: ReactNode;
}

const here = (label: string): Crumb => ({
  key: "here",
  node: <span aria-current="page">{label}</span>,
});

/** Home › owner/name › #number, or Home › Settings. The last crumb is the current page. */
function useCrumbs(): Crumb[] {
  const { t } = useI18n();
  const { owner, name, number } = useParams({ strict: false });
  const onSettings = useLocation({ select: (location) => location.pathname === "/settings" });
  const home = { key: "home", node: <Link to="/">{t("home")}</Link> };

  if (onSettings) return [home, here(t("settings"))];
  if (owner === undefined || name === undefined) return [here(t("home"))];

  const repo = `${owner}/${name}`;
  if (number === undefined) return [home, here(repo)];
  const repoLink = (
    <Link to="/repo/$owner/$name" params={{ owner, name }}>
      {repo}
    </Link>
  );
  return [home, { key: "repo", node: repoLink }, here(`#${number}`)];
}
