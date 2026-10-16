import { ChevronRight, Menu, Moon, PanelLeft, Search, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { ResolvedTheme } from "../../application/theme.ts";
import { Icon } from "../Icon.tsx";

interface HeaderProps {
  readonly t: Translate;
  /** Home first, the current page last. */
  readonly crumbs: readonly { key: string; node: ReactNode }[];
  readonly sidebarOpen: boolean;
  readonly onToggleSidebar: () => void;
  readonly onOpenMenu: () => void;
  readonly resolvedTheme: ResolvedTheme;
  readonly onToggleTheme: () => void;
  /** Opens the command palette (T25). */
  readonly onOpenPalette: () => void;
  /** The palette's shortcut as shown, e.g. "⌘K". */
  readonly paletteShortcut: string;
  /** The API quota indicator (T14). */
  readonly quota?: ReactNode;
  /** "Updated …" and the refresh button (T14). */
  readonly updated?: ReactNode;
  /** The account button (T10). */
  readonly account?: ReactNode;
}

/**
 * The design's 56 px header. Above 768 px the first button collapses the sidebar; below it
 * a menu button opens the drawer instead. CSS shows one of the two.
 */
export function Header({
  t,
  crumbs,
  sidebarOpen,
  onToggleSidebar,
  onOpenMenu,
  resolvedTheme,
  onToggleTheme,
  onOpenPalette,
  paletteShortcut,
  quota,
  updated,
  account,
}: HeaderProps) {
  const dark = resolvedTheme === "dark";
  return (
    <header className="header">
      <button
        type="button"
        className="icon-button desktop-only"
        onClick={onToggleSidebar}
        aria-label={t("toggleSidebar")}
        aria-expanded={sidebarOpen}
      >
        <Icon icon={PanelLeft} />
      </button>
      <button
        type="button"
        className="icon-button mobile-only"
        onClick={onOpenMenu}
        aria-label={t("openMenu")}
        aria-haspopup="dialog"
      >
        <Icon icon={Menu} />
      </button>
      <span className="header-divider" />
      <nav aria-label={t("breadcrumb")} className="crumbs">
        <ol>
          {crumbs.map((crumb, index) => (
            <li key={crumb.key}>
              {index > 0 && <Icon icon={ChevronRight} size={14} />}
              {crumb.node}
            </li>
          ))}
        </ol>
      </nav>
      <span className="header-spacer" />
      <button
        type="button"
        className="palette-trigger"
        onClick={onOpenPalette}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Icon icon={Search} size={14} />
        <span className="palette-trigger-label">{t("searchAll")}</span>
        <kbd>{paletteShortcut}</kbd>
      </button>
      {quota}
      {updated}
      <button
        type="button"
        className="icon-button"
        onClick={onToggleTheme}
        aria-label={dark ? t("lightTheme") : t("darkTheme")}
      >
        <Icon icon={dark ? Sun : Moon} />
      </button>
      {account}
    </header>
  );
}
