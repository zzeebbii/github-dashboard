import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

interface TabsProps<T extends string> {
  /** The tab list's accessible name. */
  readonly label: string;
  /** In order, each with its text and, optionally, a formatted count. */
  readonly tabs: readonly {
    readonly id: T;
    readonly label: string;
    readonly count?: string | undefined;
  }[];
  readonly selected: T;
  readonly onSelect: (tab: T) => void;
  /** The selected tab's panel content. */
  readonly children: ReactNode;
}

/**
 * WAI-ARIA tabs with automatic activation, after the design's `repoTabs`: one tab stop
 * (roving tabindex), arrows move and select, Home/End jump to the ends. Used by the
 * repository page (FR-4.6) and the PR panel (FR-6.1).
 */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
}: TabsProps<T>) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (tab: T) => `${base}-tab-${tab}`;
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
        {tabs.map(({ id, label: text, count }, index) => (
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
            {text}
            {count !== undefined && <span className="repo-tab-count">{count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)}>
        {children}
      </div>
    </>
  );
}
