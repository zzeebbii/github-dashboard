import { Link } from "@tanstack/react-router";
import { House, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { Language } from "../../application/preferences.ts";
import { Icon } from "../Icon.tsx";
import { LanguageSelect } from "../LanguageSelect.tsx";

interface SidebarProps {
  readonly t: Translate;
  readonly language: Language;
  readonly onLanguageChange: (language: Language) => void;
  /** The account menu at the top (T10). */
  readonly account?: ReactNode;
  /** The Favourites and Repositories sections (T16, T17). */
  readonly repositories?: ReactNode;
}

/** The sidebar (264 px by default, resizable in AppShell): account, Home, repositories, then Settings and language. */
export function Sidebar({ t, language, onLanguageChange, account, repositories }: SidebarProps) {
  return (
    <div className="sidebar">
      {account}
      <nav aria-label={t("mainNav")} className="sidebar-nav">
        <Link to="/" activeOptions={{ exact: true }} className="nav-link">
          <Icon icon={House} />
          {t("home")}
        </Link>
      </nav>
      <div className="sidebar-repositories">{repositories}</div>
      <div className="sidebar-footer">
        <Link to="/settings" className="nav-link">
          <Icon icon={Settings} />
          {t("settings")}
        </Link>
        <LanguageSelect label={t("language")} language={language} onChange={onLanguageChange} />
      </div>
    </div>
  );
}
