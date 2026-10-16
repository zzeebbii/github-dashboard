import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import type { Translate } from "../../application/i18n.tsx";
import type { RepoTab } from "../../domain/repo-tabs.ts";

interface RepoTabsProps {
  readonly t: Translate;
  /** The tab list's accessible name. */
  readonly label: string;
  /** In order, each with its formatted count. */
  readonly tabs: readonly { readonly id: RepoTab; readonly count: string }[];
  readonly selected: RepoTab;
  readonly onSelect: (tab: RepoTab) => void;
  /** The selected tab's panel content. */
  readonly children: ReactNode;
}

/**
 * Open / Draft / Needs review, after the design's `repoTabs` (FR-4.6), as WAI-ARIA tabs with
 * automatic activation: one tab stop (roving tabindex), arrows move and select, Home/End jump
 * to the ends.
 */
export function RepoTabs({ t, label, tabs, selected, onSelect, children }: RepoTabsProps) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (tab: RepoTab) => `${base}-tab-${tab}`;
  const panelId = `${base}-panel`;

  function onKeyDown(event: KeyboardEvent, index: number) {
    const n = tabs.length;
    const targets: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % n,
      ArrowLeft: (index - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const next = targets[event.key];
    const tab = next === undefined ? undefined : tabs[next];
    if (next === undefined || tab === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onSelect(tab.id);
  }

  return (
    <>
      <div className="repo-tabs" role="tablist" aria-label={label}>
        {tabs.map(({ id, count }, index) => (
          <button
            key={id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabId(id)}
            className="repo-tab"
            aria-selected={id === selected}
            aria-controls={panelId}
            tabIndex={id === selected ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {t(`rt_${id}`)}
            <span className="repo-tab-count">{count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)}>
        {children}
      </div>
    </>
  );
}
