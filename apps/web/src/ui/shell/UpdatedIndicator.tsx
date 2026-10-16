import { RefreshCw } from "lucide-react";
import type { Translate } from "../../application/i18n.tsx";
import { Icon } from "../Icon.tsx";

interface UpdatedIndicatorProps {
  readonly t: Translate;
  /** "Updated 3 min ago", "Updating…", or null before the first refresh. */
  readonly label: string | null;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}

/**
 * The design's header refresh button: a spinning icon while refreshing, and how old the data
 * is. Its name starts with "Refresh" and contains the visible text (WCAG 2.5.3).
 */
export function UpdatedIndicator({ t, label, refreshing, onRefresh }: UpdatedIndicatorProps) {
  return (
    <button
      type="button"
      className="updated-button"
      data-refreshing={refreshing}
      title={t("fr_refresh")}
      onClick={onRefresh}
    >
      <Icon icon={RefreshCw} size={14} />
      <span className="sr-only">{label === null ? t("fr_refresh") : `${t("fr_refresh")}, `}</span>
      {label !== null && <span className="updated-label">{label}</span>}
    </button>
  );
}
